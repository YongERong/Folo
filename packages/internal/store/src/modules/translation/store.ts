import { UserRole } from "@follow/constants"
import type { TranslationSchema } from "@follow/database/schemas/types"
import { TranslationService } from "@follow/database/services/translation"
import type { SupportedActionLanguage } from "@follow/shared"
import { toApiSupportedActionLanguage } from "@follow/shared"
import { buildByokTranslationPrompt } from "@follow/shared/ai/prompts"
import { checkLanguage } from "@follow/utils/language"
import { create, indexedResolver, windowScheduler } from "@yornaath/batshit"

import { api, getByokServices, isByokActiveInStore } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { readNdjsonStream } from "../../lib/stream"
import { getEntry } from "../entry/getter"
import { useUserStore } from "../user/store"
import type { EntryTranslation, TranslationFieldArray, TranslationMode } from "./types"
import { translationFields } from "./types"

type TranslationModel = Omit<TranslationSchema, "createdAt">
type TranslationBatchRequest = Parameters<ReturnType<typeof api>["ai"]["translationBatch"]>[0]

const stripJsonFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()

const extractTranslationValue = (value: string) => {
  const parts = value.split(/\n\s*\n/)
  if (parts.length <= 1) return value.trim()
  return parts.at(-1)?.trim() || value.trim()
}

const parseByokTranslationResponse = (
  response: string,
  fields: TranslationFieldArray,
  payload: Partial<Record<keyof TranslationModel, string>>,
  mode: TranslationMode,
): Partial<Record<keyof TranslationModel, string>> => {
  const trimmed = response.trim()
  if (!trimmed) return payload

  if (mode === "translation-only") {
    try {
      return JSON.parse(stripJsonFence(trimmed)) as Partial<Record<keyof TranslationModel, string>>
    } catch {
      return payload
    }
  }

  try {
    const parsed = JSON.parse(stripJsonFence(trimmed)) as Partial<
      Record<keyof TranslationModel, string>
    >
    const next: Partial<Record<keyof TranslationModel, string>> = { ...payload }
    for (const field of fields) {
      const value = parsed[field]
      if (typeof value === "string") {
        next[field] = extractTranslationValue(value)
      }
    }
    return next
  } catch {
    const next: Partial<Record<keyof TranslationModel, string>> = { ...payload }
    for (const field of fields) {
      const original = payload[field]
      if (!original) continue
      next[field] = trimmed.includes(original)
        ? extractTranslationValue(trimmed.slice(trimmed.indexOf(original)))
        : trimmed
    }
    return next
  }
}

interface TranslationState {
  data: Record<string, Partial<Record<SupportedActionLanguage, EntryTranslation>>>
}
const defaultState: TranslationState = {
  data: {},
}

export const useTranslationStore = createZustandStore<TranslationState>("translation")(
  () => defaultState,
)

const get = useTranslationStore.getState
const set = useTranslationStore.setState
const immerSet = createImmerSetter(useTranslationStore)

class TranslationActions implements Hydratable, Resetable {
  async hydrate() {
    const translations = await TranslationService.getTranslationToHydrate()
    translationActions.upsertManyInSession(translations)
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })
    tx.persist(() => TranslationService.reset())

    await tx.run()
  }

  upsertManyInSession(translations: TranslationModel[]) {
    immerSet((state) => {
      translations.forEach((translation) => {
        if (!state.data[translation.entryId]) {
          state.data[translation.entryId] = {}
        }

        if (!state.data[translation.entryId]![translation.language]) {
          state.data[translation.entryId]![translation.language] = {
            title: null,
            description: null,
            content: null,
            readabilityContent: null,
          }
        }

        translationFields.forEach((field) => {
          if (translation[field]) {
            state.data[translation.entryId]![translation.language]![field] = translation[field]
          }
        })
      })
    })
  }

  async upsertMany(translations: TranslationModel[]) {
    this.upsertManyInSession(translations)

    await Promise.all(
      translations.map((translation) => TranslationService.insertTranslation(translation)),
    )
  }

  getTranslation(entryId: string, language: SupportedActionLanguage) {
    return get().data[entryId]?.[language]
  }
}

export const translationActions = new TranslationActions()

class TranslationSyncService {
  private currentMode?: TranslationMode

  private async ensureMode(mode: TranslationMode) {
    if (!this.currentMode) {
      this.currentMode = mode
      return
    }

    if (this.currentMode === mode) return

    this.currentMode = mode
    await translationActions.reset()
  }

  private translationBatcher = create({
    fetcher: async (keys: string[]) => {
      // key format: `${entryId}|${language}|${target}|${fields}|${mode}`
      type KeyParts = {
        entryId: string
        language: SupportedActionLanguage
        target: "content" | "readabilityContent"
        fields: string
        mode: TranslationMode
      }

      const parseKey = (key: string): KeyParts => {
        const [entryId, language, target, fields, mode] = key.split("|") as [
          string,
          SupportedActionLanguage,
          "content" | "readabilityContent",
          string,
          TranslationMode | undefined,
        ]
        return { entryId, language, target, fields, mode: mode ?? "bilingual" }
      }

      const requests = keys.map(parseKey)

      // Group by language + fields + mode to minimize stream calls
      const groupKey = (r: KeyParts) => `${r.language}#${r.fields}#${r.mode}`
      const grouped = new Map<
        string,
        {
          language: SupportedActionLanguage
          fields: string
          mode: TranslationMode
          ids: string[]
          keyById: Record<string, string>
        }
      >()

      for (const r of requests) {
        const gk = groupKey(r)
        if (!grouped.has(gk)) {
          grouped.set(gk, {
            language: r.language,
            fields: r.fields,
            mode: r.mode,
            ids: [],
            keyById: {},
          })
        }
        const g = grouped.get(gk)!
        g.ids.push(r.entryId)
        g.keyById[r.entryId] = `${r.entryId}|${r.language}|${r.target}|${r.fields}|${r.mode}`
      }

      const results: Record<string, TranslationModel | null> = {}

      // Execute each group sequentially to keep memory small; groups are already windowed by scheduler
      for (const [, group] of grouped) {
        if (this.currentMode && this.currentMode !== group.mode) {
          for (const id of group.ids) {
            if (!group.keyById[id]) continue
            results[group.keyById[id]] = null
          }
          continue
        }

        try {
          const request: TranslationBatchRequest & { mode?: TranslationMode } = {
            ids: group.ids,
            language: toApiSupportedActionLanguage(group.language),
            fields: group.fields,
            mode: group.mode,
          }
          const response = await api().ai.translationBatch(request)

          await readNdjsonStream<{
            id: string
            data: Partial<Record<keyof TranslationModel, string>>
          }>(response, async (json) => {
            const key = group.keyById[json.id]
            if (!key) return

            if (this.currentMode && this.currentMode !== group.mode) return

            const translation: TranslationModel = {
              entryId: json.id,
              language: group.language,
              title: null,
              description: null,
              content: null,
              readabilityContent: null,
            }

            const { title, description, content, readabilityContent } = json.data || {}
            if (typeof title === "string") translation.title = title
            if (typeof description === "string") translation.description = description
            if (typeof content === "string") translation.content = content
            if (typeof readabilityContent === "string")
              translation.readabilityContent = readabilityContent

            results[key] = translation
            await translationActions.upsertMany([translation])
          })
        } catch (e) {
          console.error("Translation stream request failed:", e)
        }
      }

      return results
    },
    resolver: indexedResolver(),
    scheduler: windowScheduler(1000),
  })

  async generateTranslation({
    entryId,
    language,
    withContent,
    target,
    mode,
  }: {
    entryId: string
    language: SupportedActionLanguage
    withContent?: boolean
    target: "content" | "readabilityContent"
    mode?: TranslationMode
  }) {
    const userRole = useUserStore.getState().role

    if (userRole === UserRole.Free && !isByokActiveInStore()) return null
    const translationMode = mode ?? "bilingual"
    await this.ensureMode(translationMode)

    const entry = getEntry(entryId)

    if (!entry) return
    const translationSession = translationActions.getTranslation(entryId, language)

    const fields = (
      ["title", "description", ...(withContent ? [target] : [])] as TranslationFieldArray
    ).filter((field) => {
      const content = entry[field]
      if (!content) return false

      if (translationSession?.[field]) return false

      return !checkLanguage({
        content,
        language,
      })
    })

    if (fields.length === 0) return null

    if (isByokActiveInStore()) {
      return this.generateTranslationWithByok({
        entryId,
        entry,
        language,
        fields,
        mode: translationMode,
      })
    }

    const key = `${entryId}|${language}|${target}|${fields.join(",")}|${translationMode}`
    const result = await this.translationBatcher.fetch(key)
    return result || null
  }

  private async generateTranslationWithByok({
    entryId,
    entry,
    language,
    fields,
    mode,
  }: {
    entryId: string
    entry: NonNullable<ReturnType<typeof getEntry>>
    language: SupportedActionLanguage
    fields: TranslationFieldArray
    mode: TranslationMode
  }) {
    const byok = getByokServices()
    if (!byok?.isActive()) {
      return null
    }

    const payload: Partial<Record<keyof TranslationModel, string>> = {}
    for (const field of fields) {
      const value = entry[field]
      if (typeof value === "string" && value.trim()) {
        payload[field] = value
      }
    }

    if (Object.keys(payload).length === 0) {
      return null
    }

    const response = await byok.generateText({
      prompt: buildByokTranslationPrompt(payload, language, mode),
      system:
        mode === "translation-only"
          ? "Return valid JSON only. Do not wrap the response in markdown fences."
          : undefined,
    })

    if (!response) return null

    const parsed = parseByokTranslationResponse(response, fields, payload, mode)

    const translation: TranslationModel = {
      entryId,
      language,
      title: typeof parsed.title === "string" ? parsed.title : null,
      description: typeof parsed.description === "string" ? parsed.description : null,
      content: typeof parsed.content === "string" ? parsed.content : null,
      readabilityContent:
        typeof parsed.readabilityContent === "string" ? parsed.readabilityContent : null,
    }

    await translationActions.upsertMany([translation])
    return translation
  }
}

export const translationSyncService = new TranslationSyncService()
