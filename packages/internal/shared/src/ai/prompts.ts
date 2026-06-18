export const BYOK_CHAT_SYSTEM_PROMPT = `You are Folo AI, a helpful assistant inside the Folo RSS reader app.
Answer clearly and concisely. Use markdown when helpful.
When entry or feed context is provided, ground your answer in that context.`

export const buildByokSummaryPrompt = (content: string, language: string) =>
  `Summarize the following article in ${language}. Be concise, informative, and write in a natural tone.\n\n${content}`

export const buildByokTranslationPrompt = (
  fields: Record<string, string>,
  targetLanguage: string,
  mode: "bilingual" | "translation-only",
) => {
  const payload = JSON.stringify(fields, null, 2)
  if (mode === "bilingual") {
    return `Translate the JSON values into ${targetLanguage}. Keep the same JSON keys. For each string value, return the original text followed by the translation separated by a blank line.\n\n${payload}`
  }

  return `Translate the JSON values into ${targetLanguage}. Keep the same JSON keys and return valid JSON only.\n\n${payload}`
}
