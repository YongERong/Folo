import { UserRole } from "@follow/constants"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { provideByokServices } from "../../context"
import { useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { useUserStore } from "../user/store"
import { translationSyncService } from "./store"

vi.mock("@follow/database/services/translation", () => ({
  TranslationService: {
    getTranslationToHydrate: vi.fn().mockResolvedValue([]),
    reset: vi.fn(),
    insertTranslation: vi.fn().mockResolvedValue(),
  },
}))

const createEntry = (id: string): EntryModel => ({
  id,
  guid: `${id}-guid`,
  insertedAt: new Date("2026-01-01T00:00:00.000Z"),
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  title: "Title",
  description: "Description",
  content: "Content body",
})

describe("translationSyncService BYOK", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    provideByokServices({
      isActive: () => false,
      generateText: async () => null,
    })
    useUserStore.setState({ role: UserRole.Free })
    useEntryStore.setState({
      data: {
        "entry-1": createEntry("entry-1"),
      },
    })
  })

  test("bypasses Free-tier gate when BYOK is active", async () => {
    const generateTextMock = vi.fn().mockResolvedValue(JSON.stringify({ title: "Translated" }))
    provideByokServices({
      isActive: () => true,
      generateText: generateTextMock,
    })

    const result = await translationSyncService.generateTranslation({
      entryId: "entry-1",
      language: "zh-CN",
      target: "content",
      withContent: true,
      mode: "translation-only",
    })

    expect(result).toMatchObject({
      entryId: "entry-1",
      language: "zh-CN",
      title: "Translated",
    })
    expect(generateTextMock).toHaveBeenCalled()
  })

  test("returns null for Free users when BYOK is inactive", async () => {
    const result = await translationSyncService.generateTranslation({
      entryId: "entry-1",
      language: "zh-CN",
      target: "content",
      withContent: true,
    })

    expect(result).toBeNull()
  })
})
