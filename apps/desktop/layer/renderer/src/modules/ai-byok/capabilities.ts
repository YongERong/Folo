import type { UserRole } from "@follow/constants"
import { isFreeRole } from "@follow/constants"
import { isByokActiveInStore } from "@follow/store/context"
import { useUserRole } from "@follow/store/user/hooks"

import { useAISettingValue } from "~/atoms/settings/ai"

import { isByokActive } from "./routing"

export const canUseAiTranslationForRole = (role?: UserRole | null): boolean => {
  return isByokActiveInStore() || isByokActive() || !isFreeRole(role)
}

export const useIsByokActive = (): boolean => {
  useAISettingValue()
  return isByokActive()
}

export const useCanUseAiTranslation = (): boolean => {
  const role = useUserRole()
  useAISettingValue()
  return canUseAiTranslationForRole(role)
}
