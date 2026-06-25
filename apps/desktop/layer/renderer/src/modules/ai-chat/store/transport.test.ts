import { beforeEach, describe, expect, test, vi } from "vitest"

import { createChatTransport } from "./transport"

const { isByokActiveMock, byokSendMessagesMock, serverSendMessagesMock } = vi.hoisted(() => ({
  isByokActiveMock: vi.fn(),
  byokSendMessagesMock: vi.fn(),
  serverSendMessagesMock: vi.fn(),
}))

vi.mock("~/modules/ai-byok/routing", () => ({
  isByokActive: isByokActiveMock,
}))

vi.mock("./byok-transport", () => ({
  ByokChatTransport: class {
    constructor(public scene?: string) {}

    sendMessages = byokSendMessagesMock
    reconnectToStream = vi.fn()
  },
}))

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return {
    ...actual,
    HttpChatTransport: class {
      sendMessages = serverSendMessagesMock
      reconnectToStream = vi.fn()
    },
  }
})

describe("createChatTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    byokSendMessagesMock.mockResolvedValue(new ReadableStream())
    serverSendMessagesMock.mockResolvedValue(new ReadableStream())
  })

  test("uses BYOK transport when BYOK is active", async () => {
    isByokActiveMock.mockReturnValue(true)

    const transport = createChatTransport({ getScene: () => "timeline-summary" })
    await transport.sendMessages({ messages: [], abortSignal: undefined } as never)

    expect(byokSendMessagesMock).toHaveBeenCalledTimes(1)
    expect(serverSendMessagesMock).not.toHaveBeenCalled()
  })

  test("uses server transport when BYOK is inactive", async () => {
    isByokActiveMock.mockReturnValue(false)

    const transport = createChatTransport()
    await transport.sendMessages({ messages: [], abortSignal: undefined } as never)

    expect(serverSendMessagesMock).toHaveBeenCalledTimes(1)
    expect(byokSendMessagesMock).not.toHaveBeenCalled()
  })
})
