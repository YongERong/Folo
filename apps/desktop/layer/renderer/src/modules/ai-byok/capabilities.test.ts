import { UserRole } from "@follow/constants"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { canUseAiTranslationForRole } from "./capabilities"

const { isByokActiveMock, isByokActiveInStoreMock } = vi.hoisted(() => ({
  isByokActiveMock: vi.fn(),
  isByokActiveInStoreMock: vi.fn(),
}))

vi.mock("./routing", () => ({
  isByokActive: isByokActiveMock,
}))

vi.mock("@follow/store/context", () => ({
  isByokActiveInStore: isByokActiveInStoreMock,
}))

describe("BYOK capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isByokActiveMock.mockReturnValue(false)
    isByokActiveInStoreMock.mockReturnValue(false)
  })

  test("allows translation for paid roles without BYOK", () => {
    expect(canUseAiTranslationForRole(UserRole.Basic)).toBe(true)
    expect(canUseAiTranslationForRole(UserRole.Pro)).toBe(true)
  })

  test("blocks free users when BYOK is inactive", () => {
    expect(canUseAiTranslationForRole(UserRole.Free)).toBe(false)
    expect(canUseAiTranslationForRole(UserRole.Trial)).toBe(false)
  })

  test("allows free users when BYOK is active", () => {
    isByokActiveMock.mockReturnValue(true)
    expect(canUseAiTranslationForRole(UserRole.Free)).toBe(true)
  })
})
