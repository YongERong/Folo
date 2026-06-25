import { UserRole } from "@follow/constants"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { canUseAiTranslationForRole } from "./capabilities"

const { isByokActiveMock, isByokActiveInStoreMock, isByokConfiguredMock } = vi.hoisted(() => ({
  isByokActiveMock: vi.fn(),
  isByokActiveInStoreMock: vi.fn(),
  isByokConfiguredMock: vi.fn(),
}))

vi.mock("./routing", () => ({
  isByokActive: isByokActiveMock,
  isByokConfigured: isByokConfiguredMock,
}))

vi.mock("./key-vault", () => ({
  useByokKeyRegistry: () => new Set(),
}))

vi.mock("@follow/store/context", () => ({
  isByokActiveInStore: isByokActiveInStoreMock,
}))

vi.mock("@follow/store/user/hooks", () => ({
  useUserRole: () => {},
}))

vi.mock("~/atoms/settings/ai", () => ({
  useAISettingValue: () => ({}),
}))

describe("BYOK capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isByokActiveMock.mockReturnValue(false)
    isByokActiveInStoreMock.mockReturnValue(false)
    isByokConfiguredMock.mockReturnValue(false)
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

  test("allows free users when BYOK is configured", () => {
    isByokConfiguredMock.mockReturnValue(true)
    expect(canUseAiTranslationForRole(UserRole.Free)).toBe(true)
  })
})
