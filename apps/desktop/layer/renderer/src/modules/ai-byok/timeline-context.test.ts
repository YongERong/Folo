import { beforeEach, describe, expect, test, vi } from "vitest"

import type { AIChatContextBlock } from "../ai-chat/store/types"
import {
  buildTimelineContextPrompt,
  formatEntriesForByokContext,
  hasTimelineScopeBlocks,
  parseMentionEntryIds,
  parseMentionFeedIds,
  resolveEntryIdsFromContextBlocks,
} from "./timeline-context"

const {
  getEntryMock,
  getEntryIdsByFeedIdMock,
  getEntryIdsByFeedIdsMock,
  getEntryIdsByViewMock,
  getFeedByIdMock,
  getGeneralSettingsMock,
  fetchEntriesMock,
  fetchEntryContentByStreamMock,
} = vi.hoisted(() => ({
  getEntryMock: vi.fn(),
  getEntryIdsByFeedIdMock: vi.fn(),
  getEntryIdsByFeedIdsMock: vi.fn(),
  getEntryIdsByViewMock: vi.fn(),
  getFeedByIdMock: vi.fn(),
  getGeneralSettingsMock: vi.fn(),
  fetchEntriesMock: vi.fn(),
  fetchEntryContentByStreamMock: vi.fn(),
}))

vi.mock("@follow/store/entry/getter", () => ({
  getEntry: getEntryMock,
  getEntryIdsByFeedId: getEntryIdsByFeedIdMock,
  getEntryIdsByFeedIds: getEntryIdsByFeedIdsMock,
  getEntryIdsByView: getEntryIdsByViewMock,
}))

vi.mock("@follow/store/feed/getter", () => ({
  getFeedById: getFeedByIdMock,
}))

vi.mock("~/atoms/settings/general", () => ({
  getGeneralSettings: getGeneralSettingsMock,
}))

vi.mock("@follow/store/entry/store", () => ({
  entrySyncServices: {
    fetchEntries: fetchEntriesMock,
    fetchEntryContentByStream: fetchEntryContentByStreamMock,
  },
}))

describe("BYOK timeline context", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGeneralSettingsMock.mockReturnValue({
      hidePrivateSubscriptionsInTimeline: false,
    })
    getFeedByIdMock.mockImplementation((feedId: string) => ({
      id: feedId,
      title: `Feed ${feedId}`,
    }))
    fetchEntriesMock.mockResolvedValue()
    fetchEntryContentByStreamMock.mockResolvedValue()
  })

  test("parseMentionEntryIds extracts entry ids from rich text", () => {
    const text = 'Summarize <mention-entry id="entry-1"></mention-entry> please'
    expect(parseMentionEntryIds(text)).toEqual(["entry-1"])
  })

  test("parseMentionFeedIds extracts feed ids from rich text", () => {
    const text = 'Check <mention-feed ids=["feed-1","feed-2"]></mention-feed> feeds'
    expect(parseMentionFeedIds(text)).toEqual(["feed-1", "feed-2"])
  })

  test("hasTimelineScopeBlocks detects timeline scope blocks", () => {
    expect(
      hasTimelineScopeBlocks([{ id: "1", type: "mainView", value: "0", disabled: false }]),
    ).toBe(true)
    expect(
      hasTimelineScopeBlocks([{ id: "1", type: "mainEntry", value: "entry-1", disabled: false }]),
    ).toBe(false)
  })

  test("resolveEntryIdsFromContextBlocks resolves feed and view scoped entries", () => {
    getEntryIdsByFeedIdMock.mockReturnValue(["entry-feed-1"])
    getEntryIdsByViewMock.mockReturnValue(["entry-view-1"])
    getEntryMock.mockImplementation((entryId: string) => ({
      id: entryId,
      title: entryId,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      read: false,
      content: "content",
    }))

    const feedBlocks: AIChatContextBlock[] = [
      { id: "1", type: "mainFeed", value: "feed-1", disabled: false },
    ]
    expect(resolveEntryIdsFromContextBlocks(feedBlocks)).toEqual(["entry-feed-1"])

    const viewBlocks: AIChatContextBlock[] = [
      { id: "1", type: "mainView", value: "0", disabled: false },
    ]
    expect(resolveEntryIdsFromContextBlocks(viewBlocks)).toEqual(["entry-view-1"])
  })

  test("resolveEntryIdsFromContextBlocks applies unread filter", () => {
    getEntryIdsByFeedIdMock.mockReturnValue(["entry-1", "entry-2"])
    getEntryMock.mockImplementation((entryId: string) => ({
      id: entryId,
      title: entryId,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      read: entryId === "entry-2",
      content: "content",
    }))

    const blocks: AIChatContextBlock[] = [
      { id: "1", type: "mainFeed", value: "feed-1", disabled: false },
      { id: "2", type: "unreadOnly", value: "true", disabled: false },
    ]

    expect(resolveEntryIdsFromContextBlocks(blocks)).toEqual(["entry-1"])
  })

  test("formatEntriesForByokContext renders entry snippets", () => {
    getEntryMock.mockReturnValue({
      id: "entry-1",
      title: "Sample Entry",
      content: "<p>Hello world</p>",
    })

    const formatted = formatEntriesForByokContext(["entry-1"])
    expect(formatted).toContain("Timeline entries:")
    expect(formatted).toContain("Sample Entry")
    expect(formatted).toContain("Hello world")
  })

  test("buildTimelineContextPrompt hydrates entries when local store is empty", async () => {
    getEntryIdsByFeedIdMock.mockReturnValueOnce([]).mockReturnValueOnce(["entry-1"])
    getEntryMock.mockReturnValue({
      id: "entry-1",
      title: "Hydrated Entry",
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      read: false,
    })

    const blocks: AIChatContextBlock[] = [
      { id: "1", type: "mainFeed", value: "feed-1", disabled: false },
    ]

    const prompt = await buildTimelineContextPrompt(blocks)

    expect(fetchEntriesMock).toHaveBeenCalledOnce()
    expect(fetchEntryContentByStreamMock).toHaveBeenCalledWith(["entry-1"])
    expect(prompt).toContain("Feed: Feed feed-1")
    expect(prompt).toContain("Hydrated Entry")
  })
})
