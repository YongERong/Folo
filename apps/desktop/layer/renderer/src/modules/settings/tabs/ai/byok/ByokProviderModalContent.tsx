import { Button } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@follow/components/ui/select/index.js"
import { DEFAULT_BYOK_MODEL_IDS } from "@follow/shared/ai/byok"
import type { ByokProviderName, UserByokProviderConfig } from "@follow/shared/settings/interface"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  setByokApiKey,
  stripApiKeyFromProviderConfig,
  testByokConnection,
} from "~/modules/ai-byok/key-vault"

import { PROVIDER_OPTIONS } from "./constants"

interface ByokProviderModalContentProps {
  provider: UserByokProviderConfig | null
  configuredProviders?: ByokProviderName[]
  onSave: (provider: UserByokProviderConfig) => void | Promise<void>
  onCancel: () => void
}

const EMPTY_CONFIGURED_PROVIDERS: ByokProviderName[] = []

export const ByokProviderModalContent = ({
  provider,
  configuredProviders = EMPTY_CONFIGURED_PROVIDERS,
  onSave,
  onCancel,
}: ByokProviderModalContentProps) => {
  const { t } = useTranslation("ai")

  const availableProviders = PROVIDER_OPTIONS.filter(
    (option) => !configuredProviders.includes(option.value) || option.value === provider?.provider,
  )

  const defaultProvider = availableProviders[0]?.value ?? provider?.provider ?? "openai"

  const [formData, setFormData] = useState<UserByokProviderConfig>({
    provider: provider?.provider ?? defaultProvider,
    baseURL: provider?.baseURL ?? null,
    modelId: provider?.modelId ?? DEFAULT_BYOK_MODEL_IDS[defaultProvider],
    apiKey: "",
    headers: provider?.headers ?? {},
  })
  const [isTesting, setIsTesting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.provider) {
      return
    }

    const apiKey = formData.apiKey?.trim()
    if (apiKey) {
      await setByokApiKey(formData.provider, apiKey)
    }

    await onSave(stripApiKeyFromProviderConfig(formData))
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    try {
      const result = await testByokConnection({
        provider: formData.provider,
        apiKey: formData.apiKey?.trim() || undefined,
        baseURL: formData.baseURL,
        modelId: formData.modelId,
      })

      if (result.ok) {
        toast.success(t("byok.providers.test_success"))
        return
      }

      toast.error(result.message || t("byok.providers.test_failed"))
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-[40ch] space-y-4">
      <div className="space-y-2">
        <Label htmlFor="provider">{t("byok.providers.form.provider")}</Label>
        <Select
          value={formData.provider}
          disabled={availableProviders.length === 0}
          onValueChange={(value) => {
            const providerName = value as ByokProviderName
            setFormData({
              ...formData,
              provider: providerName,
              modelId: formData.modelId || DEFAULT_BYOK_MODEL_IDS[providerName],
            })
          }}
        >
          <SelectTrigger id="provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="modelId">{t("byok.providers.form.model_id")}</Label>
        <Input
          id="modelId"
          placeholder={DEFAULT_BYOK_MODEL_IDS[formData.provider]}
          value={formData.modelId ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              modelId: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.model_id_help")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="baseURL">{t("byok.providers.form.base_url")}</Label>
        <Input
          id="baseURL"
          type="url"
          placeholder={t("byok.providers.form.base_url_placeholder")}
          value={formData.baseURL ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              baseURL: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.base_url_help")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">{t("byok.providers.form.api_key")}</Label>
        <Input
          id="apiKey"
          type="password"
          placeholder={t("byok.providers.form.api_key_placeholder")}
          value={formData.apiKey ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              apiKey: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.api_key_help")}</p>
      </div>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={handleTestConnection} disabled={isTesting}>
          {isTesting ? t("byok.providers.testing") : t("byok.providers.test_connection")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("words.cancel", { ns: "common" })}
          </Button>
          <Button type="submit">{t("words.save", { ns: "common" })}</Button>
        </div>
      </div>
    </form>
  )
}
