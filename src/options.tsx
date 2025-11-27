import type { FormEvent } from "react"
import { useEffect, useRef, useState } from "react"

import "~src/styles/extension.css"

import { DEFAULT_BACKEND_URL, getSettings, saveSettings } from "~src/lib/storage"

type StatusState = {
  type: "success" | "error" | "info"
  message: string
} | null

const OptionsPage = () => {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL)
  const [apiKey, setApiKey] = useState("")
  const [status, setStatus] = useState<StatusState>(null)
  const [isSaving, setIsSaving] = useState(false)

  const statusTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light")
    const load = async () => {
      const settings = await getSettings()
      if (settings.backendUrl) {
        setBackendUrl(settings.backendUrl)
      }
      if (settings.apiKey) {
        setApiKey(settings.apiKey)
      }
    }

    void load()

    return () => {
      document.documentElement.removeAttribute("data-theme")
      if (statusTimer.current) {
        clearTimeout(statusTimer.current)
      }
    }
  }, [])

  const showStatus = (type: StatusState["type"], message: string) => {
    setStatus({ type, message })
    if (statusTimer.current) {
      clearTimeout(statusTimer.current)
    }
    statusTimer.current = setTimeout(() => setStatus(null), 5000)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedBackend = backendUrl.trim()
    const trimmedApiKey = apiKey.trim()

    if (!trimmedBackend) {
      showStatus("error", "Backend URL is required.")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        backendUrl: trimmedBackend,
        apiKey: trimmedApiKey ? trimmedApiKey : null
      }

      await saveSettings(payload)

      showStatus("success", "Settings saved. Testing backend…")

      await testBackend(trimmedBackend, payload.apiKey ?? undefined)
    } catch (error) {
      console.error("Failed to save settings:", error)
      showStatus("error", error instanceof Error ? error.message : "Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  const testBackend = async (url: string, apiKey?: string) => {
    const normalized = url.replace(/\/+$/, "")
    try {
      const headers: Record<string, string> = {}
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`
      }

      const response = await fetch(`${normalized}/api/health`, {
        headers
      })
      if (response.ok) {
        showStatus("success", "Settings saved and backend is reachable! ✓")
      } else {
        showStatus("error", "Settings saved, but backend returned an error.")
      }
    } catch (error) {
      console.error("Backend health error:", error)
      showStatus("error", "Settings saved, but backend could not be reached.")
    }
  }

  const statusClassName = status ? `status ${status.type} is-visible` : "status"

  return (
    <div className="extension-root">
      <div className="extension-card options-card">
        <h1>Panopto Video Downloader Settings</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="backend-url">
              Backend URL *
              <span className="help-text">Your backend API endpoint (e.g., https://api.example.com)</span>
            </label>
            <input
              id="backend-url"
              type="url"
              required
              value={backendUrl}
              placeholder="https://your-backend.com"
              onChange={(event) => setBackendUrl(event.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="api-key">
              API Key (Optional)
              <span className="help-text">If your backend requires authentication</span>
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              placeholder="Your API key"
              onChange={(event) => setApiKey(event.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className={statusClassName}>{status?.message}</div>

          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default OptionsPage
