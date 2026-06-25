import type { ByokProviderConfigInput } from "@follow/shared/ai/byok"
import { resolveByokModelId } from "@follow/shared/ai/byok"
import { BYOK_CHAT_SYSTEM_PROMPT } from "@follow/shared/ai/prompts"
import type { ByokProviderName } from "@follow/shared/settings/interface"
import { getEntry } from "@follow/store/entry/getter"
import { getFeedById } from "@follow/store/feed/getter"

import { getAISettings } from "~/atoms/settings/ai"

import type { AIChatContextBlock, BizUIMessage } from "../ai-chat/store/types"
import { isDataBlockPart } from "../ai-chat/utils/extractor"
import { getActiveByokProvider } from "./routing"
import {
  buildTimelineContextPrompt,
  hasTimelineScopeBlocks,
  parseMentionEntryIds,
  parseMentionFeedIds,
} from "./timeline-context"

const MAX_ENTRY_CONTENT_CHARS = 12_000

const stripHtml = (value: string) =>
  value
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()

const resolveContextBlock = (block: AIChatContextBlock): string | null => {
  if (block.disabled) return null

  switch (block.type) {
    case "mainEntry": {
      const entry = getEntry(block.value)
      if (!entry) return `Entry ${block.value} is unavailable locally.`
      const content = entry.content || entry.readabilityContent || entry.description || entry.title
      const normalized = stripHtml(content || "")
      return [
        `Entry: ${entry.title}`,
        normalized ? `Content:\n${normalized.slice(0, MAX_ENTRY_CONTENT_CHARS)}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    }
    case "mainFeed": {
      const feed = getFeedById(block.value)
      return feed ? `Feed: ${feed.title}` : `Feed ${block.value} is unavailable locally.`
    }
    case "mainView": {
      return `Timeline view: ${block.value}`
    }
    case "unreadOnly": {
      return block.value === "true" ? "Scope: unread entries only." : "Scope: all entries."
    }
    case "fileAttachment": {
      const { attachment } = block
      return `Attachment: ${attachment.name} (${attachment.type}, ${attachment.size} bytes)`
    }
    default: {
      return null
    }
  }
}

export const buildByokContextPrompt = (blocks: AIChatContextBlock[]): string => {
  const sections = blocks
    .map((block) => resolveContextBlock(block))
    .filter((section): section is string => !!section)

  if (sections.length === 0) return ""

  return ["Context:", ...sections.map((section) => `- ${section}`)].join("\n")
}

const extractTextFromMessage = (message: BizUIMessage): string => {
  const segments: string[] = []

  for (const part of message.parts) {
    switch (part.type) {
      case "text": {
        if ("text" in part && part.text) {
          segments.push(part.text)
        }
        break
      }
      case "data-rich-text": {
        const text = part.data?.text?.trim()
        if (text) {
          segments.push(text)
        }
        break
      }
      default: {
        break
      }
    }
  }

  return segments.join("\n").trim()
}

export const buildByokContextPromptAsync = async (
  blocks: AIChatContextBlock[],
  userText = "",
): Promise<string> => {
  const enabledBlocks = blocks.filter((block) => !block.disabled)
  const hasTimelineContext =
    hasTimelineScopeBlocks(enabledBlocks) ||
    parseMentionEntryIds(userText).length > 0 ||
    parseMentionFeedIds(userText).length > 0

  if (hasTimelineContext) {
    const timelineSection = await buildTimelineContextPrompt(enabledBlocks, userText)
    const attachmentSections = enabledBlocks
      .map((block) => (block.type === "fileAttachment" ? resolveContextBlock(block) : null))
      .filter((section): section is string => !!section)

    return [timelineSection, ...attachmentSections].filter(Boolean).join("\n\n")
  }

  return buildByokContextPrompt(blocks)
}

export const convertBizMessagesToByokMessagesAsync = async (
  messages: BizUIMessage[],
): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> => {
  const converted: Array<{ role: "user" | "assistant" | "system"; content: string }> = []

  for (const message of messages) {
    const text = extractTextFromMessage(message)
    const contextBlocks = message.parts.flatMap((part) => (isDataBlockPart(part) ? part.data : []))
    const contextPrompt = await buildByokContextPromptAsync(contextBlocks, text)
    const mergedContent = [contextPrompt, text].filter(Boolean).join("\n\n")

    if (!mergedContent) continue

    if (message.role === "system") {
      converted.push({ role: "system", content: mergedContent })
      continue
    }

    if (message.role === "assistant") {
      converted.push({ role: "assistant", content: mergedContent })
      continue
    }

    converted.push({ role: "user", content: mergedContent })
  }

  return converted
}

export const convertBizMessagesToByokMessages = (
  messages: BizUIMessage[],
): Array<{ role: "user" | "assistant" | "system"; content: string }> => {
  const converted: Array<{ role: "user" | "assistant" | "system"; content: string }> = []

  for (const message of messages) {
    const text = extractTextFromMessage(message)
    const contextBlocks = message.parts.flatMap((part) => (isDataBlockPart(part) ? part.data : []))
    const contextPrompt = buildByokContextPrompt(contextBlocks)
    const mergedContent = [contextPrompt, text].filter(Boolean).join("\n\n")

    if (!mergedContent) continue

    if (message.role === "system") {
      converted.push({ role: "system", content: mergedContent })
      continue
    }

    if (message.role === "assistant") {
      converted.push({ role: "assistant", content: mergedContent })
      continue
    }

    converted.push({ role: "user", content: mergedContent })
  }

  return converted
}

export const buildByokSystemPrompt = (scene?: string): string => {
  const aiSettings = getAISettings()
  const parts = [BYOK_CHAT_SYSTEM_PROMPT, aiSettings.personalizePrompt]

  if (scene === "timeline-summary" && aiSettings.aiTimelinePrompt) {
    parts.push(aiSettings.aiTimelinePrompt)
  }

  return parts.filter(Boolean).join("\n\n")
}

export const buildActiveByokProviderConfig = (): ByokProviderConfigInput | null => {
  const provider = getActiveByokProvider()
  if (!provider) return null

  return {
    provider: provider.provider,
    baseURL: provider.baseURL ?? null,
    modelId: provider.modelId ?? null,
    apiKey: "",
  }
}

export const resolveActiveByokModelId = (providerName?: ByokProviderName | null): string | null => {
  const provider = getActiveByokProvider()
  if (!provider) return null
  return resolveByokModelId(providerName ?? provider.provider, provider.modelId)
}
