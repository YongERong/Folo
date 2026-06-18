import type { ByokStreamChatInput } from "@follow/shared/ai/byok"
import type { ChatTransport, UIMessageChunk } from "ai"

import { requireIpcServices } from "~/lib/client"
import {
  buildActiveByokProviderConfig,
  buildByokSystemPrompt,
  convertBizMessagesToByokMessages,
  resolveActiveByokModelId,
} from "~/modules/ai-byok/context-builder"
import { listenToByokStream } from "~/modules/ai-byok/stream"

import type { BizUIMessage } from "./types"

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

    const request: ByokStreamChatInput = {
      provider,
      modelId,
      system: buildByokSystemPrompt(this.scene),
      messages: convertBizMessagesToByokMessages(messages),
      personalizePrompt: undefined,
    }

    const startResult = await requireIpcServices().ai.streamChat(request)
    if ("error" in startResult) {
      throw new Error(startResult.error)
    }

    const { streamId } = startResult

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        let disposed = false

        const dispose = listenToByokStream(streamId, {
          onEvent: (event) => {
            if (disposed) return

            switch (event.type) {
              case "text-start":
              case "text-delta":
              case "text-end": {
                controller.enqueue(event)
                break
              }
              case "finish": {
                controller.enqueue({
                  type: "finish",
                  finishReason: "stop",
                  messageMetadata: event.metadata,
                })
                controller.close()
                break
              }
              case "error": {
                controller.error(new Error(event.message))
                break
              }
              default: {
                break
              }
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
      },
    })
  }

  async reconnectToStream(
    _options: Parameters<ChatTransport<BizUIMessage>["reconnectToStream"]>[0],
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}
