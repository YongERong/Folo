import { beforeEach, describe, expect, test, vi } from "vitest"

import { provideByokServices } from "../../context"
import { useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { sortEntryIdsWithByok } from "./byok-sort"

const createEntry = (id: string, title: string): EntryModel => ({
  id,
  guid: `${id}-guid`,
  insertedAt: new Date("2026-01-01T00:00:00.000Z"),
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  title,
  description: `${title} description`,
})

describe("sortEntryIdsWithByok", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    provideByokServices({
      isActive: () => false,
      generateText: async () => null,
    })
    useEntryStore.setState({
      data: {
        "entry-1": createEntry("entry-1", "First"),
        "entry-2": createEntry("entry-2", "Second"),
        "entry-3": createEntry("entry-3", "Third"),
      },
    })
  })

  test("returns original order when BYOK is inactive", async () => {
    const entryIds = ["entry-1", "entry-2", "entry-3"]
    await expect(sortEntryIdsWithByok(entryIds)).resolves.toEqual(entryIds)
  })

  test("reorders entries using BYOK response", async () => {
    const generateTextMock = vi
      .fn()
      .mockResolvedValue(JSON.stringify(["entry-3", "entry-1", "entry-2"]))

    provideByokServices({
      isActive: () => true,
      generateText: generateTextMock,
    })

    const result = await sortEntryIdsWithByok(["entry-1", "entry-2", "entry-3"])

    expect(generateTextMock).toHaveBeenCalledOnce()
    expect(result).toEqual(["entry-3", "entry-1", "entry-2"])
  })
})
