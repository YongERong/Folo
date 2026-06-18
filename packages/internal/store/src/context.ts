import type { AuthClient } from "@follow/shared/auth"
import type { QueryClient } from "@tanstack/react-query"

import type { FollowAPI } from "./types"

const NO_VALUE_DEFAULT = Symbol("NO_VALUE_DEFAULT")
type ContextValue<T> = T | typeof NO_VALUE_DEFAULT

function createJSContext<T>() {
  let contextValue: ContextValue<T> = NO_VALUE_DEFAULT

  const provide = (value: T) => {
    contextValue = value
  }

  const consumer = (): T => {
    if (contextValue === NO_VALUE_DEFAULT) {
      throw new TypeError("You should only use this context value inside a provider.")
    }
    return contextValue
  }

  return {
    provide,
    consumer,
  }
}

export const apiContext = createJSContext<FollowAPI>()
export const authClientContext = createJSContext<AuthClient>()
export const queryClientContext = createJSContext<QueryClient>()

export type ByokGenerateTextParams = {
  prompt: string
  system?: string
}

export type ByokServices = {
  isActive: () => boolean
  generateText: (params: ByokGenerateTextParams) => Promise<string | null>
}

const NO_BYOK_VALUE = Symbol("NO_BYOK_VALUE")

let byokServices: ByokServices | typeof NO_BYOK_VALUE = NO_BYOK_VALUE

export const provideByokServices = (services: ByokServices) => {
  byokServices = services
}

export const getByokServices = (): ByokServices | null => {
  if (byokServices === NO_BYOK_VALUE) return null
  return byokServices
}

export const isByokActiveInStore = (): boolean => {
  return getByokServices()?.isActive() ?? false
}

export const api = apiContext.consumer
export const authClient = authClientContext.consumer
export const queryClient = queryClientContext.consumer
