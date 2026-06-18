import type { ByokProviderName } from "@follow/shared/settings/interface"
import { safeStorage } from "electron"

import { store } from "./store"

const BYOK_KEYS_STORE_KEY = "byokKeys" as const

type EncryptedByokKeys = Partial<Record<ByokProviderName, string>>

const readEncryptedKeys = (): EncryptedByokKeys => {
  return (store.get(BYOK_KEYS_STORE_KEY) as EncryptedByokKeys | undefined) ?? {}
}

const writeEncryptedKeys = (keys: EncryptedByokKeys) => {
  store.set(BYOK_KEYS_STORE_KEY, keys)
}

const encryptApiKey = (apiKey: string): string => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(apiKey).toString("base64")
  }

  return Buffer.from(apiKey, "utf8").toString("base64")
}

const decryptApiKey = (encrypted: string): string | null => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
    }

    return Buffer.from(encrypted, "base64").toString("utf8")
  } catch {
    return null
  }
}

export const setByokApiKey = (provider: ByokProviderName, apiKey: string) => {
  const nextKeys = readEncryptedKeys()
  nextKeys[provider] = encryptApiKey(apiKey)
  writeEncryptedKeys(nextKeys)
}

export const deleteByokApiKey = (provider: ByokProviderName) => {
  const nextKeys = readEncryptedKeys()
  delete nextKeys[provider]
  writeEncryptedKeys(nextKeys)
}

export const hasByokApiKey = (provider: ByokProviderName): boolean => {
  const encrypted = readEncryptedKeys()[provider]
  if (!encrypted) return false
  return decryptApiKey(encrypted) !== null
}

export const getByokApiKey = (provider: ByokProviderName): string | null => {
  const encrypted = readEncryptedKeys()[provider]
  if (!encrypted) return null
  return decryptApiKey(encrypted)
}

export const listByokProvidersWithKeys = (): ByokProviderName[] => {
  const encryptedKeys = readEncryptedKeys()
  return (Object.keys(encryptedKeys) as ByokProviderName[]).filter((provider) =>
    hasByokApiKey(provider),
  )
}
