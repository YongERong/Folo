import { beforeEach, describe, expect, test, vi } from "vitest"

import {
  deleteByokApiKey,
  markProviderHasKey,
  providerHasStoredKey,
  refreshByokKeyRegistry,
  setByokApiKey,
  stripApiKeyFromProviderConfig,
} from "./key-vault"

const { listByokProvidersWithKeysMock, setByokApiKeyMock, deleteByokApiKeyMock } = vi.hoisted(
  () => ({
    listByokProvidersWithKeysMock: vi.fn(),
    setByokApiKeyMock: vi.fn(),
    deleteByokApiKeyMock: vi.fn(),
  }),
)

vi.mock("~/lib/client", () => ({
  requireIpcServices: () => ({
    ai: {
      listByokProvidersWithKeys: listByokProvidersWithKeysMock,
      setByokApiKey: setByokApiKeyMock,
      deleteByokApiKey: deleteByokApiKeyMock,
    },
  }),
}))

vi.mock("@follow/shared/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@follow/shared/constants")>()
  return {
    ...actual,
    IN_ELECTRON: true,
  }
})

describe("BYOK key vault", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listByokProvidersWithKeysMock.mockResolvedValue([])
  })

  test("refreshByokKeyRegistry loads providers with keys from IPC", async () => {
    listByokProvidersWithKeysMock.mockResolvedValue(["openai", "google"])

    await refreshByokKeyRegistry()

    expect(providerHasStoredKey("openai")).toBe(true)
    expect(providerHasStoredKey("google")).toBe(true)
    expect(providerHasStoredKey("openrouter")).toBe(false)
  })

  test("setByokApiKey stores key via IPC and updates registry", async () => {
    setByokApiKeyMock.mockResolvedValue()

    await setByokApiKey("openai", "sk-test")

    expect(setByokApiKeyMock).toHaveBeenCalledWith({ provider: "openai", apiKey: "sk-test" })
    expect(providerHasStoredKey("openai")).toBe(true)
  })

  test("deleteByokApiKey removes key via IPC and updates registry", async () => {
    markProviderHasKey("openai", true)

    await deleteByokApiKey("openai")

    expect(deleteByokApiKeyMock).toHaveBeenCalledWith({ provider: "openai" })
    expect(providerHasStoredKey("openai")).toBe(false)
  })

  test("stripApiKeyFromProviderConfig removes apiKey from persisted config", () => {
    const sanitized = stripApiKeyFromProviderConfig({
      provider: "openai",
      apiKey: "sk-secret",
      modelId: "gpt-4o-mini",
    })

    expect(sanitized).toEqual({
      provider: "openai",
      modelId: "gpt-4o-mini",
    })
    expect("apiKey" in sanitized).toBe(false)
  })
})
