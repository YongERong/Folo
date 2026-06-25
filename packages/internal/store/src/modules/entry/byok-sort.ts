import { getByokServices } from "../../context"
import { getEntry } from "./getter"

const MAX_AI_SORT_ENTRIES = 100

const stripJsonFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()

const buildSortPrompt = (entryIds: string[]) => {
  const lines = entryIds.map((entryId, index) => {
    const entry = getEntry(entryId)
    const description = entry?.description?.replaceAll(/\s+/g, " ").trim().slice(0, 160)
    return [
      `${index + 1}. id=${entryId}`,
      `title=${entry?.title ?? "Untitled"}`,
      description ? `description=${description}` : null,
    ]
      .filter(Boolean)
      .join(" | ")
  })

  return [
    "Sort these RSS timeline entries from most to least interesting for a general reader.",
    "Return a JSON array of entry id strings in sorted order. Include every id exactly once.",
    "",
    ...lines,
  ].join("\n")
}

const parseSortedEntryIds = (response: string, entryIds: string[]) => {
  try {
    const parsed = JSON.parse(stripJsonFence(response)) as unknown
    if (!Array.isArray(parsed)) return null

    const validIds = parsed.filter(
      (id): id is string => typeof id === "string" && entryIds.includes(id),
    )
    if (validIds.length === 0) return null

    const seen = new Set<string>()
    const ordered = validIds.filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })

    return [...ordered, ...entryIds.filter((id) => !seen.has(id))]
  } catch {
    return null
  }
}

export const sortEntryIdsWithByok = async (entryIds: string[]): Promise<string[]> => {
  const byok = getByokServices()
  if (!byok?.isActive() || entryIds.length <= 1) {
    return entryIds
  }

  const scopedEntryIds = entryIds.slice(0, MAX_AI_SORT_ENTRIES)
  const response = await byok.generateText({
    system:
      "You sort RSS feeds for relevance. Respond with valid JSON only: an array of entry id strings.",
    prompt: buildSortPrompt(scopedEntryIds),
  })

  if (!response) {
    return entryIds
  }

  const sortedScopedIds = parseSortedEntryIds(response, scopedEntryIds)
  if (!sortedScopedIds) {
    return entryIds
  }

  return [...sortedScopedIds, ...entryIds.slice(MAX_AI_SORT_ENTRIES)]
}
