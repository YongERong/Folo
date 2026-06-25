import type { ByokStreamChatInput, ByokStreamEvent } from "@follow/shared/ai/byok"
import type { ChatTransport, UIMessageChunk } from "ai"
import { nanoid } from "nanoid"

import { requireIpcServices } from "~/lib/client"
import {
  buildActiveByokProviderConfig,
  buildByokSystemPrompt,
  convertBizMessagesToByokMessagesAsync,
  resolveActiveByokModelId,
} from "~/modules/ai-byok/context-builder"
import { listenToByokStream } from "~/modules/ai-byok/stream"

import type { BizUIMessage } from "./types"

const toUiMessageChunk = (event: ByokStreamEvent): UIMessageChunk | null => {
  switch (event.type) {
    case "text-start": {
      return { type: "text-start", id: event.id }
    }
    case "text-delta": {
      return { type: "text-delta", id: event.id, delta: event.delta }
    }
    case "text-end": {
      return { type: "text-end", id: event.id }
    }
    case "finish": {
      return {
        type: "finish",
        finishReason: "stop",
        messageMetadata: event.metadata,
      }
    }
    default: {
      return null
    }
  }
}

export class ByokChatTransport implements ChatTransport<BizUIMessage> {
  constructor(private readonly scene?: string) {}

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<BizUIMessage>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const provider = buildActiveByokProviderConfig()
    const modelId = resolveActiveByokModelId()

    if (!provider || !modelId) {
      throw new Error("BYOK is enabled but no provider is configured.")
    }

    const streamId = nanoid()
    const request: ByokStreamChatInput = {
      streamId,
      provider,
      modelId,
      system: buildByokSystemPrompt(this.scene),
      messages: await convertBizMessagesToByokMessagesAsync(messages),
      personalizePrompt: undefined,
    }

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        let disposed = false

        const dispose = listenToByokStream(streamId, {
          onEvent: (event) => {
            if (disposed) return

            if (event.type === "error") {
              controller.error(new Error(event.message))
              return
            }

            const chunk = toUiMessageChunk(event)
            if (!chunk) return

            controller.enqueue(chunk)

            if (event.type === "finish") {
              controller.close()
            }
          },
          onComplete: () => {
            if (disposed) return
            disposed = true
          },
        })

        abortSignal?.addEventListener(
          "abort",
          () => {
            disposed = true
            dispose()
            controller.close()
          },
          { once: true },
        )

        // Register the IPC listener before starting the main-process stream.
        // Otherwise text-start can be emitted before the renderer is listening.
        void requireIpcServices()
          .ai.streamChat(request)
          .then((startResult) => {
            if (disposed) return

            if ("error" in startResult) {
              controller.error(new Error(startResult.error))
            }
          })
          .catch((error) => {
            if (disposed) return
            controller.error(error instanceof Error ? error : new Error(String(error)))
          })
      },
    })
  }

  async reconnectToStream(
    _options: Parameters<ChatTransport<BizUIMessage>["reconnectToStream"]>[0],
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}
