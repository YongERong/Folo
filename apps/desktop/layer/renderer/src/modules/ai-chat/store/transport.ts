import { env } from "@follow/shared/env.desktop"
import type { ChatTransport, HttpChatTransportInitOptions, UIMessageChunk } from "ai"
import { HttpChatTransport, parseJsonEventStream, uiMessageChunkSchema } from "ai"

import { isByokActive } from "~/modules/ai-byok/routing"

import { getAIModelState } from "../atoms/session"
import { AIPersistService } from "../services"
import { ByokChatTransport } from "./byok-transport"
import type { BizUIMessage } from "./types"

type TitleHandlerPersistOption = boolean | ((title: string) => void | Promise<void>)

export interface TitleHandlerOptions {
  chatId?: string
  shouldHandle?: () => boolean
  onTitleChange?: (title: string) => void
  persist?: TitleHandlerPersistOption
}

export interface CreateChatTransportOptions {
  onValue?: (value: UIMessageChunk) => void
  titleHandler?: TitleHandlerOptions
}

export interface CreateChatTitleHandlerOptions {
  chatId: string
  getActiveChatId: () => string | null | undefined
  onTitleChange?: (title: string) => void
  persist?: TitleHandlerPersistOption
}

export function createChatTitleHandler(
  options: CreateChatTitleHandlerOptions,
): TitleHandlerOptions {
  const { chatId, getActiveChatId, onTitleChange, persist } = options

  return {
    chatId,
    persist,
    onTitleChange,
    shouldHandle: () => getActiveChatId() === chatId,
  }
}

/**
 * Create a chat transport for AI SDK
 * This is used by the AbstractChat instance to communicate with AI providers
 */
class DynamicChatTransport implements ChatTransport<BizUIMessage> {
  constructor(
    private readonly options: CreateChatTransportOptions & {
      scene?: string
      getScene?: () => string | undefined
    } = {},
  ) {}

  private resolveScene() {
    return this.options.getScene?.() ?? this.options.scene
  }

  sendMessages(options: Parameters<ChatTransport<BizUIMessage>["sendMessages"]>[0]) {
    const transport = isByokActive()
      ? new ByokChatTransport(this.resolveScene())
      : new ExtendChatTransport({
          onValue: this.options.onValue,
          titleHandler: this.options.titleHandler,
          api: `${env.VITE_API_URL}/ai/chat`,
          credentials: "include",
          body: () => {
            const modelState = getAIModelState()
            const { selectedModel } = modelState
            return selectedModel ? { model: selectedModel } : {}
          },
        })

    return transport.sendMessages(options)
  }

  reconnectToStream(options: Parameters<ChatTransport<BizUIMessage>["reconnectToStream"]>[0]) {
    if (isByokActive()) {
      return new ByokChatTransport(this.resolveScene()).reconnectToStream(options)
    }

    return new ExtendChatTransport({
      onValue: this.options.onValue,
      titleHandler: this.options.titleHandler,
      api: `${env.VITE_API_URL}/ai/chat`,
      credentials: "include",
      body: () => {
        const modelState = getAIModelState()
        const { selectedModel } = modelState
        return selectedModel ? { model: selectedModel } : {}
      },
    }).reconnectToStream(options)
  }
}

export function createChatTransport({
  onValue,
  titleHandler,
  scene,
  getScene,
}: CreateChatTransportOptions & {
  scene?: string
  getScene?: () => string | undefined
} = {}) {
  return new DynamicChatTransport({ onValue, titleHandler, scene, getScene })
}

type UIMessageChunkParseResult =
  ReturnType<typeof parseJsonEventStream<UIMessageChunk>> extends ReadableStream<infer T>
    ? T
    : never

const coerceFinishChunk = (chunk: UIMessageChunkParseResult): UIMessageChunk | null => {
  const { rawValue } = chunk
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return null
  }

  if ((rawValue as { type?: unknown }).type !== "finish") {
    return null
  }

  const { finishReason, messageMetadata } = rawValue as {
    finishReason?: unknown
    messageMetadata?: unknown
  }

  return {
    type: "finish",
    finishReason: typeof finishReason === "string" ? finishReason : undefined,
    messageMetadata,
  } as UIMessageChunk
}

class ExtendChatTransport extends HttpChatTransport<BizUIMessage> {
  constructor(
    private options: HttpChatTransportInitOptions<BizUIMessage> & {
      onValue?: (value: UIMessageChunk) => void
      titleHandler?: TitleHandlerOptions
    },
  ) {
    super(options)
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageChunk> {
    const { onValue } = this.options || {}
    const handleGeneratedTitle = this.handleGeneratedTitle.bind(this)
    return parseJsonEventStream({
      stream,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream<UIMessageChunkParseResult, UIMessageChunk>({
        async transform(chunk, controller) {
          const parsedChunk = chunk.success ? chunk.value : coerceFinishChunk(chunk)
          if (!parsedChunk) {
            throw chunk.error
          }

          await handleGeneratedTitle(parsedChunk)
          onValue?.(parsedChunk)
          controller.enqueue(parsedChunk)
        },
      }),
    )
  }

  private async handleGeneratedTitle(chunk: UIMessageChunk) {
    const { titleHandler } = this.options
    if (!titleHandler) {
      return
    }

    if (chunk.type !== "data-generated-title" || typeof chunk.data !== "string") {
      return
    }

    const shouldHandle = titleHandler.shouldHandle?.() ?? true
    if (!shouldHandle) {
      return
    }

    titleHandler.onTitleChange?.(chunk.data)

    const persistOption = titleHandler.persist
    const shouldPersist = persistOption === undefined ? true : persistOption

    if (!shouldPersist) {
      return
    }

    try {
      if (typeof persistOption === "function") {
        await persistOption(chunk.data)
        return
      }

      if (titleHandler.chatId) {
        await AIPersistService.updateSessionTitle(titleHandler.chatId, chunk.data)
      }
    } catch (error) {
      console.error("Failed to persist generated title:", error)
    }
  }

  override reconnectToStream(
    options: Parameters<HttpChatTransport<BizUIMessage>["reconnectToStream"]>[0],
  ) {
    options.chatId = encodeURIComponent(options.chatId)
    return super.reconnectToStream(options)
  }
}
