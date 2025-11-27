export const DEFAULT_BACKEND_URL = "http://localhost:8000"

const SETTINGS_KEYS = ["backendUrl", "apiKey"] as const

export type ExtensionSettings = {
  backendUrl?: string
  apiKey?: string | null
}

export const getSettings = async (): Promise<ExtensionSettings> => {
  const result = await chrome.storage.sync.get(SETTINGS_KEYS as unknown as string[])
  return {
    backendUrl: typeof result.backendUrl === "string" ? result.backendUrl : undefined,
    apiKey: typeof result.apiKey === "string" ? result.apiKey : null
  }
}

export const saveSettings = async (settings: ExtensionSettings) => {
  await chrome.storage.sync.set(settings)
}
