import { beforeEach, describe, expect, test, vi } from "vitest"

import { getFeature } from "./useFeature"

const { isByokActiveMock } = vi.hoisted(() => ({
  isByokActiveMock: vi.fn(),
}))

vi.mock("~/modules/ai-byok/routing", () => ({
  isByokActive: isByokActiveMock,
}))

vi.mock("~/atoms/debug-feature", () => ({
  useDebugFeatureValue: () => ({}),
  getDebugFeatureValue: () => ({}),
}))

vi.mock("~/atoms/server-configs", () => ({
  useServerConfigs: () => ({}),
  getServerConfigs: () => ({}),
}))

describe("useFeature ai with BYOK", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isByokActiveMock.mockReturnValue(false)
  })

  test("getFeature('ai') returns true when BYOK is active", () => {
    isByokActiveMock.mockReturnValue(true)
    expect(getFeature("ai")).toBe(true)
  })

  test("getFeature('ai') returns false when BYOK is inactive and server flag is off", () => {
    expect(getFeature("ai")).toBe(false)
  })
})
