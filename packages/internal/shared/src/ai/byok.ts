import type { ByokProviderName } from "../settings/interface.js"

export type ByokFeature = "chat" | "summary" | "translation" | "title"

export type ByokProviderConfigInput = {
  provider: ByokProviderName
  baseURL?: string | null
  modelId?: string | null
  apiKey: string
}

export type ByokChatMessageInput = {
  role: "user" | "assistant" | "system"
  content: string
}

export type ByokStreamChatInput = {
  provider: ByokProviderConfigInput
  modelId: string
  system?: string
  messages: ByokChatMessageInput[]
  personalizePrompt?: string
}

export type ByokGenerateTextInput = {
  provider: ByokProviderConfigInput
  modelId: string
  system?: string
  prompt: string
}

export type ByokStreamEvent =
  | { streamId: string; type: "text-start"; id: string }
  | { streamId: string; type: "text-delta"; id: string; delta: string }
  | { streamId: string; type: "text-end"; id: string }
  | {
      streamId: string
      type: "finish"
      metadata: {
        providerType: "byok"
        provider: string
        modelUsed: string
        totalTokens?: number
        inputTokens?: number
        outputTokens?: number
      }
    }
  | { streamId: string; type: "error"; message: string }

export const BYOK_STREAM_CHANNEL = "byok-ai-stream" as const

export const DEFAULT_BYOK_MODEL_IDS: Record<ByokProviderName, string> = {
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash",
  openrouter: "openai/gpt-4o-mini",
  "vercel-ai-gateway": "openai/gpt-4o-mini",
}

export const resolveByokModelId = (provider: ByokProviderName, modelId?: string | null): string => {
  const trimmed = modelId?.trim()
  if (trimmed) return trimmed
  return DEFAULT_BYOK_MODEL_IDS[provider]
}
