import type { ByokGenerateTextInput } from "@follow/shared/ai/byok"
import { IN_ELECTRON } from "@follow/shared/constants"
import type { UserByokProviderConfig } from "@follow/shared/settings/interface"
import { provideByokServices } from "@follow/store/context"

import { requireIpcServices } from "~/lib/client"

import { buildActiveByokProviderConfig, resolveActiveByokModelId } from "./context-builder"
import { refreshByokKeyRegistry } from "./key-vault"
import { isByokActive } from "./routing"

export const registerByokServices = () => {
  provideByokServices({
    isActive: () => isByokActive(),
    generateText: async ({ prompt, system }) => {
      if (!IN_ELECTRON || !isByokActive()) {
        return null
      }

      const provider = buildActiveByokProviderConfig()
      const modelId = resolveActiveByokModelId()
      if (!provider || !modelId) {
        return null
      }

      const request: ByokGenerateTextInput = {
        provider,
        modelId,
        prompt,
        system,
      }

      const result = await requireIpcServices().ai.generateText(request)
      if (result.error) {
        throw new Error(result.error)
      }

      return result.text
    },
  })
}

export const initializeByok = async () => {
  if (!IN_ELECTRON) return

  await refreshByokKeyRegistry()
  registerByokServices()
}

export const migrateLegacyByokApiKeys = async () => {
  if (!IN_ELECTRON) return

  const { getAISettings, setAISetting } = await import("~/atoms/settings/ai")
  const { byok } = getAISettings()
  if (!byok?.providers?.length) return

  let migrated = false
  const nextProviders: UserByokProviderConfig[] = []

  for (const provider of byok.providers) {
    if (provider.apiKey) {
      const { setByokApiKey, stripApiKeyFromProviderConfig } = await import("./key-vault")
      await setByokApiKey(provider.provider, provider.apiKey)
      nextProviders.push(stripApiKeyFromProviderConfig(provider))
      migrated = true
      continue
    }

    nextProviders.push(provider)
  }

  if (migrated) {
    setAISetting("byok", {
      ...byok,
      providers: nextProviders,
    })
  }

  await refreshByokKeyRegistry()
}
