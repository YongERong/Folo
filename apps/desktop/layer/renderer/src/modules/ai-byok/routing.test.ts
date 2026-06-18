import { beforeEach, describe, expect, test, vi } from "vitest"

import {
  getActiveByokProvider,
  getConfiguredByokProviders,
  isByokActive,
  shouldUseByokForFeature,
} from "./routing"

const { getAISettingsMock, providerHasStoredKeyMock } = vi.hoisted(() => ({
  getAISettingsMock: vi.fn(),
  providerHasStoredKeyMock: vi.fn(),
}))

vi.mock("~/atoms/settings/ai", () => ({
  getAISettings: getAISettingsMock,
}))

vi.mock("./key-vault", () => ({
  providerHasStoredKey: providerHasStoredKeyMock,
}))

vi.mock("@follow/shared/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@follow/shared/constants")>()
  return {
    ...actual,
    IN_ELECTRON: true,
  }
})

describe("BYOK routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    providerHasStoredKeyMock.mockReturnValue(true)
  })

  test("isByokActive returns false when BYOK is disabled", () => {
    getAISettingsMock.mockReturnValue({
      byok: { enabled: false, providers: [{ provider: "openai" }] },
    })

    expect(isByokActive()).toBe(false)
  })

  test("isByokActive returns false when no provider has a stored key", () => {
    getAISettingsMock.mockReturnValue({
      byok: { enabled: true, providers: [{ provider: "openai" }] },
    })
    providerHasStoredKeyMock.mockReturnValue(false)

    expect(isByokActive()).toBe(false)
  })

  test("isByokActive returns true when enabled and a provider has a key", () => {
    getAISettingsMock.mockReturnValue({
      byok: {
        enabled: true,
        providers: [{ provider: "openai" }, { provider: "google" }],
      },
    })
    providerHasStoredKeyMock.mockImplementation((provider: string) => provider === "google")

    expect(isByokActive()).toBe(true)
  })

  test("getActiveByokProvider prefers a provider with a stored key", () => {
    getAISettingsMock.mockReturnValue({
      byok: {
        enabled: true,
        providers: [
          { provider: "openai", modelId: "gpt-4o-mini" },
          { provider: "google", modelId: "gemini-2.0-flash" },
        ],
      },
    })
    providerHasStoredKeyMock.mockImplementation((provider: string) => provider === "google")

    expect(getActiveByokProvider()).toMatchObject({
      provider: "google",
      modelId: "gemini-2.0-flash",
    })
  })

  test("getConfiguredByokProviders returns only providers with stored keys", () => {
    getAISettingsMock.mockReturnValue({
      byok: {
        enabled: true,
        providers: [{ provider: "openai" }, { provider: "google" }, { provider: "openrouter" }],
      },
    })
    providerHasStoredKeyMock.mockImplementation(
      (provider: string) => provider === "openai" || provider === "openrouter",
    )

    expect(getConfiguredByokProviders()).toEqual(["openai", "openrouter"])
  })

  test("shouldUseByokForFeature mirrors isByokActive", () => {
    getAISettingsMock.mockReturnValue({
      byok: { enabled: true, providers: [{ provider: "openai" }] },
    })

    expect(shouldUseByokForFeature("chat")).toBe(true)
    expect(shouldUseByokForFeature("translation")).toBe(true)
  })
})
