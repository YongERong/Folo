import type { UIMessageChunk } from "ai"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { ByokChatTransport } from "./byok-transport"

const { streamChatMock, listenToByokStreamMock } = vi.hoisted(() => ({
  streamChatMock: vi.fn(),
  listenToByokStreamMock: vi.fn(),
}))

vi.mock("~/lib/client", () => ({
  requireIpcServices: () => ({
    ai: {
      streamChat: streamChatMock,
    },
  }),
}))

vi.mock("~/modules/ai-byok/context-builder", () => ({
  buildActiveByokProviderConfig: () => ({
    provider: "openai",
    apiKey: "",
    baseURL: null,
    modelId: "gpt-4o-mini",
  }),
  buildByokSystemPrompt: () => "system prompt",
  convertBizMessagesToByokMessagesAsync: async () => [{ role: "user", content: "hello" }],
  resolveActiveByokModelId: () => "gpt-4o-mini",
}))

vi.mock("~/modules/ai-byok/stream", () => ({
  listenToByokStream: listenToByokStreamMock,
}))

describe("ByokChatTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamChatMock.mockResolvedValue({ streamId: "stream-1" })
    listenToByokStreamMock.mockImplementation((_streamId, handlers) => {
      handlers.onEvent({ streamId: "stream-1", type: "text-start", id: "text-1" })
      handlers.onEvent({ streamId: "stream-1", type: "text-delta", id: "text-1", delta: "Hi" })
      handlers.onEvent({
        streamId: "stream-1",
        type: "finish",
        metadata: {
          providerType: "byok",
          provider: "openai",
          modelUsed: "gpt-4o-mini",
        },
      })
      return () => {}
    })
  })

  test("registers IPC listener before starting streamChat", async () => {
    const callOrder: string[] = []

    listenToByokStreamMock.mockImplementation((streamId, handlers) => {
      callOrder.push("listen")
      expect(streamId).toBeTruthy()
      handlers.onEvent({ streamId, type: "text-start", id: "text-1" })
      handlers.onEvent({ streamId, type: "text-delta", id: "text-1", delta: "Hi" })
      handlers.onEvent({
        streamId,
        type: "finish",
        metadata: {
          providerType: "byok",
          provider: "openai",
          modelUsed: "gpt-4o-mini",
        },
      })
      return () => {}
    })

    streamChatMock.mockImplementation(async (request) => {
      callOrder.push("streamChat")
      expect(request.streamId).toBeTruthy()
      return { streamId: request.streamId }
    })

    const transport = new ByokChatTransport()
    const stream = await transport.sendMessages({ messages: [], abortSignal: undefined } as never)
    const reader = stream.getReader()
    const chunks: UIMessageChunk[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    expect(callOrder).toEqual(["listen", "streamChat"])
    expect(chunks.map((chunk) => chunk.type)).toEqual(["text-start", "text-delta", "finish"])
  })
})
