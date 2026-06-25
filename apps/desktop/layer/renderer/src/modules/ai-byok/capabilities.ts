import type { UserRole } from "@follow/constants"
import { isFreeRole } from "@follow/constants"
import { isByokActiveInStore } from "@follow/store/context"
import { useUserRole } from "@follow/store/user/hooks"

import { useAISettingValue } from "~/atoms/settings/ai"

import { useByokKeyRegistry } from "./key-vault"
import { isByokActive, isByokConfigured } from "./routing"

export const canUseAiTranslationForRole = (role?: UserRole | null): boolean => {
  return isByokActiveInStore() || isByokActive() || isByokConfigured() || !isFreeRole(role)
}

export const useIsByokActive = (): boolean => {
  useAISettingValue()
  useByokKeyRegistry()
  return isByokActive()
}

export const useByokUnlocksPaidSettings = (): boolean => {
  useAISettingValue()
  useByokKeyRegistry()
  return isByokActive() || isByokConfigured()
}

export const useCanUseAiTranslation = (): boolean => {
  const role = useUserRole()
  useAISettingValue()
  useByokKeyRegistry()
  return canUseAiTranslationForRole(role)
}
