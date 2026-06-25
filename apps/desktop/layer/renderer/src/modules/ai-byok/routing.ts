import type { ByokFeature } from "@follow/shared/ai/byok"
import { IN_ELECTRON } from "@follow/shared/constants"
import type { ByokProviderName, UserByokProviderConfig } from "@follow/shared/settings/interface"

import { getAISettings } from "~/atoms/settings/ai"

import { providerHasStoredKey } from "./key-vault"

export const getByokSettings = () => {
  return getAISettings().byok ?? { enabled: false, providers: [] }
}

export const getActiveByokProvider = (): UserByokProviderConfig | null => {
  const byok = getByokSettings()
  if (!byok.enabled) return null

  return (
    byok.providers.find((provider) => providerHasStoredKey(provider.provider)) ??
    byok.providers[0] ??
    null
  )
}

export const isByokConfigured = (): boolean => {
  if (!IN_ELECTRON) return false

  const byok = getByokSettings()
  return byok.enabled && byok.providers.length > 0
}

export const isByokActive = (): boolean => {
  if (!isByokConfigured()) {
    return false
  }

  const byok = getByokSettings()
  return byok.providers.some((provider) => providerHasStoredKey(provider.provider))
}

export const shouldUseByokForFeature = (_feature: ByokFeature): boolean => {
  return isByokActive()
}

export const getConfiguredByokProviders = (): ByokProviderName[] => {
  return getByokSettings()
    .providers.map((provider) => provider.provider)
    .filter((provider) => providerHasStoredKey(provider))
}
