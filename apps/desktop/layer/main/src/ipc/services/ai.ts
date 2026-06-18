import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type {
  ByokGenerateTextInput,
  ByokProviderConfigInput,
  ByokStreamChatInput,
  ByokStreamEvent,
} from "@follow/shared/ai/byok"
import { BYOK_STREAM_CHANNEL, resolveByokModelId } from "@follow/shared/ai/byok"
import type { ByokProviderName } from "@follow/shared/settings/interface"
import { generateText, streamText } from "ai"
import type { WebContents } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"
import { nanoid } from "nanoid"

import {
  deleteByokApiKey,
  getByokApiKey,
  hasByokApiKey,
  listByokProvidersWithKeys,
  setByokApiKey,
} from "../../lib/byok-key-store"

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

const createLanguageModel = (config: ByokProviderConfigInput, modelId: string) => {
  switch (config.provider) {
    case "openai": {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL ?? undefined,
      })
      return openai(modelId)
    }
    case "google": {
      const google = createGoogleGenerativeAI({
        apiKey: config.apiKey,
      })
      return google(modelId)
    }
    case "openrouter": {
      const openrouter = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL ?? OPENROUTER_DEFAULT_BASE_URL,
      })
      return openrouter(modelId)
    }
    case "vercel-ai-gateway": {
      const gateway = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL ?? undefined,
      })
      return gateway(modelId)
    }
    default: {
      const unreachable: never = config.provider
      throw new Error(`Unsupported BYOK provider: ${unreachable}`)
    }
  }
}

const resolveProviderConfig = (
  provider: ByokProviderName,
  overrides?: Partial<ByokProviderConfigInput>,
): ByokProviderConfigInput => {
  const apiKey = overrides?.apiKey ?? getByokApiKey(provider)
  if (!apiKey) {
    throw new Error(`Missing API key for provider: ${provider}`)
  }

  return {
    provider,
    apiKey,
    baseURL: overrides?.baseURL ?? null,
    modelId: overrides?.modelId ?? null,
  }
}

const emitStreamEvent = (sender: WebContents, event: ByokStreamEvent) => {
  sender.send(BYOK_STREAM_CHANNEL, event)
}

export class AIService extends IpcService {
  static override readonly groupName = "ai"

  @IpcMethod()
  setByokApiKey(_context: IpcContext, input: { provider: ByokProviderName; apiKey: string }) {
    setByokApiKey(input.provider, input.apiKey)
  }

  @IpcMethod()
  deleteByokApiKey(_context: IpcContext, input: { provider: ByokProviderName }) {
    deleteByokApiKey(input.provider)
  }

  @IpcMethod()
  hasByokApiKey(_context: IpcContext, input: { provider: ByokProviderName }): boolean {
    return hasByokApiKey(input.provider)
  }

  @IpcMethod()
  listByokProvidersWithKeys(_context: IpcContext): ByokProviderName[] {
    return listByokProvidersWithKeys()
  }

  @IpcMethod()
  async testByokConnection(
    _context: IpcContext,
    input: {
      provider: ByokProviderName
      apiKey?: string
      baseURL?: string | null
      modelId?: string | null
    },
  ): Promise<{ ok: boolean; message?: string }> {
    try {
      const providerConfig = resolveProviderConfig(input.provider, {
        apiKey: input.apiKey,
        baseURL: input.baseURL,
        modelId: input.modelId,
      })
      const modelId = resolveByokModelId(providerConfig.provider, providerConfig.modelId)
      const model = createLanguageModel(providerConfig, modelId)

      await generateText({
        model,
        prompt: "Reply with OK only.",
      })

      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      }
    }
  }

  @IpcMethod()
  async generateText(
    _context: IpcContext,
    input: ByokGenerateTextInput,
  ): Promise<{ text: string | null; error?: string }> {
    try {
      const providerConfig = resolveProviderConfig(input.provider.provider, {
        baseURL: input.provider.baseURL,
        modelId: input.modelId ?? input.provider.modelId,
        apiKey: input.provider.apiKey || undefined,
      })
      const resolvedModelId = resolveByokModelId(providerConfig.provider, input.modelId)
      const model = createLanguageModel(providerConfig, resolvedModelId)
      const result = await generateText({
        model,
        system: input.system,
        prompt: input.prompt,
      })

      return { text: result.text.trim() || null }
    } catch (error) {
      return {
        text: null,
        error: error instanceof Error ? error.message : "BYOK generateText failed",
      }
    }
  }

  @IpcMethod()
  async streamChat(
    context: IpcContext,
    input: ByokStreamChatInput,
  ): Promise<{ streamId: string } | { error: string }> {
    const streamId = nanoid()
    const modelId = resolveByokModelId(input.provider.provider, input.modelId)
    const textPartId = nanoid()

    void this.runStreamChat({
      sender: context.sender,
      streamId,
      textPartId,
      input,
      modelId,
    })

    return { streamId }
  }

  private async runStreamChat({
    sender,
    streamId,
    textPartId,
    input,
    modelId,
  }: {
    sender: WebContents
    streamId: string
    textPartId: string
    input: ByokStreamChatInput
    modelId: string
  }) {
    try {
      const providerConfig = resolveProviderConfig(input.provider.provider, {
        baseURL: input.provider.baseURL,
        modelId: input.modelId,
        apiKey: input.provider.apiKey || undefined,
      })
      const resolvedModelId = resolveByokModelId(providerConfig.provider, modelId)
      const model = createLanguageModel(providerConfig, resolvedModelId)
      const systemParts = [input.system, input.personalizePrompt].filter(Boolean)
      const system = systemParts.length > 0 ? systemParts.join("\n\n") : undefined

      emitStreamEvent(sender, { streamId, type: "text-start", id: textPartId })

      const result = streamText({
        model,
        system,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      })

      for await (const delta of result.textStream) {
        if (!delta) continue
        emitStreamEvent(sender, {
          streamId,
          type: "text-delta",
          id: textPartId,
          delta,
        })
      }

      emitStreamEvent(sender, { streamId, type: "text-end", id: textPartId })

      const usage = await result.usage
      emitStreamEvent(sender, {
        streamId,
        type: "finish",
        metadata: {
          providerType: "byok",
          provider: input.provider.provider,
          modelUsed: resolvedModelId,
          totalTokens: usage.totalTokens,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      })
    } catch (error) {
      emitStreamEvent(sender, {
        streamId,
        type: "error",
        message: error instanceof Error ? error.message : "BYOK stream failed",
      })
    }
  }
}
