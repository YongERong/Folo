import { IN_ELECTRON } from "@follow/shared/constants"
import type { ByokProviderName } from "@follow/shared/settings/interface"

import { requireIpcServices } from "~/lib/client"

const providersWithKeys = new Set<ByokProviderName>()

export const refreshByokKeyRegistry = async () => {
  providersWithKeys.clear()

  if (!IN_ELECTRON) {
    return
  }

  try {
    const providers = await requireIpcServices().ai.listByokProvidersWithKeys()
    providers.forEach((provider) => providersWithKeys.add(provider))
  } catch (error) {
    console.error("Failed to refresh BYOK key registry:", error)
  }
}

export const markProviderHasKey = (provider: ByokProviderName, hasKey: boolean) => {
  if (hasKey) {
    providersWithKeys.add(provider)
    return
  }

  providersWithKeys.delete(provider)
}

export const providerHasStoredKey = (provider: ByokProviderName) => {
  return providersWithKeys.has(provider)
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
