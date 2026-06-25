import { DEFAULT_BYOK_MODEL_IDS, resolveByokModelId } from "@follow/shared/ai/byok"
import { useEffect, useMemo } from "react"

import { setAISetting, useAISettingValue } from "~/atoms/settings/ai"
import { getActiveByokProvider, isByokActive } from "~/modules/ai-byok/routing"

import { setAIModelState, useAIModelState } from "../atoms/session"
import { useAIConfiguration } from "./useAIConfiguration"

export const useAIModel = () => {
  const { data: configuration, isLoading } = useAIConfiguration()
  const modelState = useAIModelState()
  const aiSettings = useAISettingValue()
  const byokActive = isByokActive()

  useEffect(() => {
    if (byokActive || !configuration || isLoading) return

    const { selectedModel } = modelState
    const { defaultModel, availableModels = [] } = configuration

    if (!selectedModel || !availableModels.includes(selectedModel)) {
      setAIModelState({
        selectedModel: defaultModel || null,
      })
    }
  }, [byokActive, configuration, isLoading, modelState])

  const currentModel = useMemo(() => {
    if (byokActive) {
      const provider = getActiveByokProvider()
      if (!provider) return null
      return resolveByokModelId(provider.provider, provider.modelId)
    }

    if (!configuration) return null

    const { selectedModel } = modelState
    const { defaultModel, availableModels = [] } = configuration

    if (selectedModel && availableModels.includes(selectedModel)) {
      return selectedModel
    }

    return defaultModel || null
  }, [byokActive, configuration, modelState, aiSettings.byok])

  const changeModel = (model: string) => {
    if (byokActive) {
      const provider = getActiveByokProvider()
      if (!provider) return

      const byok = aiSettings.byok ?? { enabled: false, providers: [] }
      setAISetting("byok", {
        ...byok,
        providers: byok.providers.map((item) =>
          item.provider === provider.provider ? { ...item, modelId: model } : item,
        ),
      })
      return
    }

    if (!configuration?.availableModels?.includes(model)) {
      console.warn(`Model ${model} is not available in current configuration`)
      return
    }

    setAIModelState({
      selectedModel: model,
    })
  }

  const byokProvider = getActiveByokProvider()

  return {
    data: {
      defaultModel: byokActive
        ? resolveByokModelId(byokProvider?.provider ?? "openai", byokProvider?.modelId)
        : configuration?.defaultModel,
      availableModels: byokActive
        ? byokProvider
          ? [resolveByokModelId(byokProvider.provider, byokProvider.modelId)]
          : []
        : configuration?.availableModels,
      availableModelsMenu: byokActive
        ? byokProvider
          ? [
              {
                label: resolveByokModelId(byokProvider.provider, byokProvider.modelId),
                value: resolveByokModelId(byokProvider.provider, byokProvider.modelId),
              },
            ]
          : []
        : configuration?.availableModelsMenu,
      currentModel,
      isByok: byokActive,
      byokDefaultModel: byokProvider ? DEFAULT_BYOK_MODEL_IDS[byokProvider.provider] : undefined,
    },
    isLoading: byokActive ? false : isLoading,
    changeModel,
  }
}
