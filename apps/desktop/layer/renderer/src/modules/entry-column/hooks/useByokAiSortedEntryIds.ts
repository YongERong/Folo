import { sortEntryIdsWithByok } from "@follow/store/entry/byok-sort"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

export const useByokAiSortedEntryIds = ({
  entryIds,
  enabled,
  queryKey,
}: {
  entryIds: string[]
  enabled: boolean
  queryKey?: (string | number | boolean | string[] | undefined)[]
}) => {
  const sortQueryKey = useMemo(
    () => ["byok-ai-sort", queryKey, entryIds] as const,
    [entryIds, queryKey],
  )

  const sortQuery = useQuery({
    queryKey: sortQueryKey,
    queryFn: () => sortEntryIdsWithByok(entryIds),
    enabled: enabled && entryIds.length > 1,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  return {
    entryIds: sortQuery.data ?? entryIds,
    isSorting: sortQuery.isFetching,
    error: sortQuery.error,
  }
}
