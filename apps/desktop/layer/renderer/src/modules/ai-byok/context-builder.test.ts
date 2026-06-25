import { beforeEach, describe, expect, test, vi } from "vitest"

import type { BizUIMessage } from "../ai-chat/store/types"
import {
  buildByokContextPrompt,
  buildByokSystemPrompt,
  convertBizMessagesToByokMessagesAsync,
  resolveActiveByokModelId,
} from "./context-builder"

const {
  getAISettingsMock,
  getEntryMock,
  getFeedByIdMock,
  getEntryIdsByFeedIdMock,
  fetchEntriesMock,
  fetchEntryContentByStreamMock,
  getGeneralSettingsMock,
} = vi.hoisted(() => ({
  getAISettingsMock: vi.fn(),
  getEntryMock: vi.fn(),
  getFeedByIdMock: vi.fn(),
  getEntryIdsByFeedIdMock: vi.fn(),
  fetchEntriesMock: vi.fn(),
  fetchEntryContentByStreamMock: vi.fn(),
  getGeneralSettingsMock: vi.fn(),
}))

vi.mock("~/atoms/settings/ai", () => ({
  getAISettings: getAISettingsMock,
}))

vi.mock("~/atoms/settings/general", () => ({
  getGeneralSettings: getGeneralSettingsMock,
}))

vi.mock("@follow/store/entry/getter", () => ({
  getEntry: getEntryMock,
  getEntryIdsByFeedId: getEntryIdsByFeedIdMock,
  getEntryIdsByFeedIds: vi.fn(() => []),
  getEntryIdsByView: vi.fn(() => []),
}))

vi.mock("@follow/store/feed/getter", () => ({
  getFeedById: getFeedByIdMock,
}))

vi.mock("@follow/store/entry/store", () => ({
  entrySyncServices: {
    fetchEntries: fetchEntriesMock,
    fetchEntryContentByStream: fetchEntryContentByStreamMock,
  },
}))

vi.mock("./routing", () => ({
  getActiveByokProvider: () => ({
    provider: "openai",
    modelId: "gpt-4o-mini",
  }),
}))

describe("BYOK context builder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAISettingsMock.mockReturnValue({
      personalizePrompt: "Keep answers short.",
      aiTimelinePrompt: "Summarize the timeline.",
    })
    getGeneralSettingsMock.mockReturnValue({
      hidePrivateSubscriptionsInTimeline: false,
    })
    getEntryMock.mockReturnValue({
      id: "entry-1",
      title: "Sample Entry",
      content: "<p>Hello world</p>",
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      read: false,
    })
    getFeedByIdMock.mockReturnValue({
      id: "feed-1",
      title: "Sample Feed",
    })
    getEntryIdsByFeedIdMock.mockReturnValue([])
    fetchEntriesMock.mockResolvedValue()
    fetchEntryContentByStreamMock.mockResolvedValue()
  })

  test("buildByokContextPrompt resolves entry blocks into prompt text", () => {
    const prompt = buildByokContextPrompt([
      { id: "block-1", type: "mainEntry", value: "entry-1", disabled: false },
      { id: "block-2", type: "mainFeed", value: "feed-1", disabled: false },
    ])

    expect(prompt).toContain("Entry: Sample Entry")
    expect(prompt).toContain("Hello world")
    expect(prompt).toContain("Feed: Sample Feed")
  })

  test("buildByokContextPrompt skips disabled blocks", () => {
    const prompt = buildByokContextPrompt([
      { id: "block-1", type: "mainEntry", value: "entry-1", disabled: true },
    ])

    expect(prompt).toBe("")
  })

  test("convertBizMessagesToByokMessages merges context blocks with user text", async () => {
    const messages: BizUIMessage[] = [
      {
        id: "msg-1",
        role: "user",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        parts: [
          {
            type: "data-block",
            data: [{ id: "block-1", type: "mainEntry", value: "entry-1", disabled: false }],
          },
          {
            type: "data-rich-text",
            data: {
              state: "{}",
              text: "Summarize this entry.",
            },
          },
        ],
      },
    ]

    expect(await convertBizMessagesToByokMessagesAsync(messages)).toEqual([
      {
        role: "user",
        content: expect.stringContaining("Summarize this entry."),
      },
    ])
  })

  test("convertBizMessagesToByokMessages includes only context when rich text is empty", async () => {
    const messages: BizUIMessage[] = [
      {
        id: "msg-1",
        role: "user",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        parts: [
          {
            type: "data-block",
            data: [{ id: "block-1", type: "mainFeed", value: "feed-1", disabled: false }],
          },
          {
            type: "data-rich-text",
            data: {
              state: "{}",
              text: "   ",
            },
          },
        ],
      },
    ]

    const [converted] = await convertBizMessagesToByokMessagesAsync(messages)
    expect(converted?.content).toContain("Feed: Sample Feed")
    expect(converted?.content).not.toContain("Summarize")
  })

  test("buildByokSystemPrompt includes timeline prompt for timeline-summary scene", () => {
    const prompt = buildByokSystemPrompt("timeline-summary")

    expect(prompt).toContain("Keep answers short.")
    expect(prompt).toContain("Summarize the timeline.")
  })

  test("resolveActiveByokModelId falls back to configured provider model", () => {
    expect(resolveActiveByokModelId()).toBe("gpt-4o-mini")
  })
})
