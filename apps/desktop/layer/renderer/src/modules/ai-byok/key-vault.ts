import { IN_ELECTRON } from "@follow/shared/constants"
import type { ByokProviderName } from "@follow/shared/settings/interface"
import { atom, useAtomValue } from "jotai"

import { requireIpcServices } from "~/lib/client"
import { jotaiStore } from "~/lib/jotai"

const byokKeyRegistryAtom = atom<ReadonlySet<ByokProviderName>>(new Set<ByokProviderName>())

const setByokKeyRegistry = (providers: Iterable<ByokProviderName>) => {
  jotaiStore.set(byokKeyRegistryAtom, new Set(providers))
}

export const useByokKeyRegistry = () => useAtomValue(byokKeyRegistryAtom)

export const refreshByokKeyRegistry = async () => {
  if (!IN_ELECTRON) {
    setByokKeyRegistry([])
    return
  }

  try {
    const providers = await requireIpcServices().ai.listByokProvidersWithKeys()
    setByokKeyRegistry(providers)
  } catch (error) {
    console.error("Failed to refresh BYOK key registry:", error)
  }
}

export const markProviderHasKey = (provider: ByokProviderName, hasKey: boolean) => {
  const current = jotaiStore.get(byokKeyRegistryAtom)
  const next = new Set(current)

  if (hasKey) {
    next.add(provider)
  } else {
    next.delete(provider)
  }

  setByokKeyRegistry(next)
}

export const providerHasStoredKey = (provider: ByokProviderName) => {
  return jotaiStore.get(byokKeyRegistryAtom).has(provider)
}

export const setByokApiKey = async (provider: ByokProviderName, apiKey: string) => {
  if (!IN_ELECTRON) return

  await requireIpcServices().ai.setByokApiKey({ provider, apiKey })
  markProviderHasKey(provider, true)
}

export const deleteByokApiKey = async (provider: ByokProviderName) => {
  if (!IN_ELECTRON) return

  await requireIpcServices().ai.deleteByokApiKey({ provider })
  markProviderHasKey(provider, false)
}

export const testByokConnection = async (input: {
  provider: ByokProviderName
  apiKey?: string
  baseURL?: string | null
  modelId?: string | null
}) => {
  if (!IN_ELECTRON) {
    return { ok: false, message: "BYOK is only available in the desktop app." }
  }

  return requireIpcServices().ai.testByokConnection(input)
}

export const stripApiKeyFromProviderConfig = <T extends { apiKey?: string | null }>(
  provider: T,
): Omit<T, "apiKey"> => {
  const { apiKey: _apiKey, ...rest } = provider
  return rest
}
