import type { FeedViewType } from "@follow/constants"
import { getView } from "@follow/constants"
import { ROUTE_FEED_PENDING } from "@follow/store/constants/app"
import {
  getEntry,
  getEntryIdsByFeedId,
  getEntryIdsByFeedIds,
  getEntryIdsByView,
} from "@follow/store/entry/getter"
import { entrySyncServices } from "@follow/store/entry/store"
import { getEntriesParams } from "@follow/store/entry/utils"
import { getFeedById } from "@follow/store/feed/getter"

import { getGeneralSettings } from "~/atoms/settings/general"

import type { AIChatContextBlock } from "../ai-chat/store/types"

const MAX_TIMELINE_ENTRIES = 40
const MAX_ENTRY_SNIPPET_CHARS = 1_200

const MENTION_ENTRY_REGEX = /<mention-entry id="([^"]+)"><\/mention-entry>/g
const MENTION_FEED_REGEX = /<mention-feed ids=(\[[^\]]*\])><\/mention-feed>/g

const stripHtml = (value: string) =>
  value
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()

export const parseMentionEntryIds = (text: string): string[] => {
  const ids: string[] = []
  for (const match of text.matchAll(MENTION_ENTRY_REGEX)) {
    if (match[1]) ids.push(match[1])
  }
  return ids
}

export const parseMentionFeedIds = (text: string): string[] => {
  const feedIds: string[] = []
  for (const match of text.matchAll(MENTION_FEED_REGEX)) {
    if (!match[1]) continue
    try {
      const parsed = JSON.parse(match[1]) as unknown
      if (Array.isArray(parsed)) {
        feedIds.push(...parsed.filter((id): id is string => typeof id === "string"))
      }
    } catch {
      continue
    }
  }
  return feedIds
}

const sortEntryIdsByPublishDate = (entryIds: string[]) => {
  return [...entryIds].sort((a, b) => {
    const entryA = getEntry(a)
    const entryB = getEntry(b)
    if (!entryA || !entryB) return 0
    return entryB.publishedAt.getTime() - entryA.publishedAt.getTime()
  })
}

const applyUnreadFilter = (entryIds: string[], unreadOnly: boolean) => {
  if (!unreadOnly) return entryIds

  return entryIds.filter((id) => {
    const entry = getEntry(id)
    return entry ? !entry.read : false
  })
}

export const resolveEntryIdsFromContextBlocks = (
  blocks: AIChatContextBlock[],
  userText = "",
): string[] => {
  const { hidePrivateSubscriptionsInTimeline } = getGeneralSettings()
  let view: FeedViewType | undefined
  let feedValue: string | undefined
  let unreadOnly = false
  const explicitEntryIds: string[] = []

  for (const block of blocks) {
    if (block.disabled) continue

    switch (block.type) {
      case "mainEntry": {
        explicitEntryIds.push(block.value)
        break
      }
      case "mainView": {
        view = Number(block.value) as FeedViewType
        break
      }
      case "mainFeed": {
        feedValue = block.value
        break
      }
      case "unreadOnly": {
        unreadOnly = block.value === "true"
        break
      }
      default: {
        break
      }
    }
  }

  const mentionEntryIds = parseMentionEntryIds(userText)
  const mentionFeedIds = parseMentionFeedIds(userText)

  let scopedEntryIds: string[] = []

  if (feedValue && feedValue !== ROUTE_FEED_PENDING && feedValue !== "all") {
    scopedEntryIds = feedValue.includes(",")
      ? (getEntryIdsByFeedIds(feedValue.split(",")) ?? [])
      : (getEntryIdsByFeedId(feedValue) ?? [])
  } else if (typeof view === "number" && !Number.isNaN(view)) {
    scopedEntryIds = getEntryIdsByView(view, hidePrivateSubscriptionsInTimeline) ?? []
  }

  if (mentionFeedIds.length > 0) {
    scopedEntryIds = [...scopedEntryIds, ...(getEntryIdsByFeedIds(mentionFeedIds) ?? [])]
  }

  const merged = [...new Set([...explicitEntryIds, ...mentionEntryIds, ...scopedEntryIds])]
  const filtered = applyUnreadFilter(merged, unreadOnly)

  return sortEntryIdsByPublishDate(filtered).slice(0, MAX_TIMELINE_ENTRIES)
}

export const hasTimelineScopeBlocks = (blocks: AIChatContextBlock[]) => {
  return blocks.some(
    (block) =>
      !block.disabled &&
      (block.type === "mainFeed" || block.type === "mainView" || block.type === "unreadOnly"),
  )
}

const buildScopeLines = (blocks: AIChatContextBlock[]) => {
  const lines: string[] = []

  for (const block of blocks) {
    if (block.disabled) continue

    switch (block.type) {
      case "mainView": {
        const viewDef = getView(Number(block.value))
        lines.push(`Timeline view: ${viewDef?.name ?? block.value}`)
        break
      }
      case "mainFeed": {
        if (block.value.includes(",")) {
          const titles = block.value
            .split(",")
            .map((feedId) => getFeedById(feedId)?.title ?? feedId)
            .join(", ")
          lines.push(`Feeds: ${titles}`)
        } else {
          const feed = getFeedById(block.value)
          lines.push(feed ? `Feed: ${feed.title}` : `Feed: ${block.value}`)
        }
        break
      }
      case "unreadOnly": {
        lines.push(block.value === "true" ? "Scope: unread entries only." : "Scope: all entries.")
        break
      }
      default: {
        break
      }
    }
  }

  return lines
}

export const formatEntrySnippet = (entryId: string): string | null => {
  const entry = getEntry(entryId)
  if (!entry) return `Entry ${entryId} is unavailable locally.`

  const content = entry.content || entry.readabilityContent || entry.description || entry.title
  const normalized = stripHtml(content || "")

  return [
    `Entry: ${entry.title}`,
    normalized ? `Content:\n${normalized.slice(0, MAX_ENTRY_SNIPPET_CHARS)}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

export const formatEntriesForByokContext = (entryIds: string[]) => {
  const sections = entryIds
    .map((entryId) => formatEntrySnippet(entryId))
    .filter((section): section is string => !!section)

  if (sections.length === 0) return ""

  return [
    "Timeline entries:",
    ...sections.map((section) => `- ${section.replaceAll("\n", "\n  ")}`),
  ].join("\n")
}

const blocksToFetchParams = (blocks: AIChatContextBlock[]) => {
  const { hidePrivateSubscriptionsInTimeline } = getGeneralSettings()
  let view: FeedViewType | undefined
  let feedValue: string | undefined
  let unreadOnly = false

  for (const block of blocks) {
    if (block.disabled) continue
    if (block.type === "mainView") view = Number(block.value) as FeedViewType
    if (block.type === "mainFeed") feedValue = block.value
    if (block.type === "unreadOnly") unreadOnly = block.value === "true"
  }

  const params = getEntriesParams({
    view,
    feedId: feedValue?.includes(",") ? undefined : feedValue,
    feedIdList: feedValue?.includes(",") ? feedValue.split(",") : undefined,
  })

  if (!params.feedId && !params.feedIdList && typeof params.view !== "number") {
    return null
  }

  return {
    ...params,
    limit: MAX_TIMELINE_ENTRIES,
    excludePrivate: hidePrivateSubscriptionsInTimeline,
    read: unreadOnly ? false : undefined,
  }
}

export const ensureEntryContentLoaded = async (entryIds: string[]) => {
  const missingContentIds = entryIds
    .filter((id) => {
      const entry = getEntry(id)
      return entry && !entry.content && !entry.readabilityContent
    })
    .slice(0, 30)

  if (missingContentIds.length === 0) return

  await entrySyncServices.fetchEntryContentByStream(missingContentIds)
}

export const hydrateTimelineEntryIds = async (
  blocks: AIChatContextBlock[],
  userText: string,
): Promise<string[]> => {
  let entryIds = resolveEntryIdsFromContextBlocks(blocks, userText)

  if (entryIds.length === 0 && hasTimelineScopeBlocks(blocks)) {
    const fetchParams = blocksToFetchParams(blocks)
    if (fetchParams) {
      await entrySyncServices.fetchEntries(fetchParams)
      entryIds = resolveEntryIdsFromContextBlocks(blocks, userText)
    }
  }

  if (entryIds.length > 0) {
    await ensureEntryContentLoaded(entryIds)
  }

  return entryIds
}

export const buildTimelineContextPrompt = async (
  blocks: AIChatContextBlock[],
  userText = "",
): Promise<string> => {
  const entryIds = await hydrateTimelineEntryIds(blocks, userText)
  const scopeLines = buildScopeLines(blocks)
  const entriesSection = formatEntriesForByokContext(entryIds)

  const sections = [
    scopeLines.length > 0 ? ["Scope:", ...scopeLines.map((line) => `- ${line}`)].join("\n") : "",
    entriesSection,
  ].filter(Boolean)

  if (sections.length === 0) return ""

  return ["Context:", ...sections].join("\n\n")
}
