import { SignInButton, SignedIn, SignedOut, UserButton, useAuth } from "@clerk/chrome-extension"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { DEFAULT_BACKEND_URL, getSettings } from "~src/lib/storage"
import type { UploadProgress } from "~src/lib/types"

type StatusState = {
  type: "success" | "error" | "info"
  message: string
} | null

type CourseOption = {
  id: string
  label: string
}

type RawCourse = {
  id?: string | number
  course_id?: string | number
  code?: string
  course_code?: string
  name?: string
  course_name?: string
  [key: string]: unknown
}

const SUPPORTED_HOSTS = ["panopto.com", "panopto.eu"]
const VIEWER_PATHS = ["/Panopto/Pages/Viewer.aspx", "/Panopto/Pages/Embed.aspx"]

const queryActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve(tabs?.[0] ?? null)
    })
  })
}

const sendMessage = async <T,>(tabId: number, payload: unknown): Promise<T> => {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve(response as T)
    })
  })
}

const isPanoptoHost = (url: string) => {
  try {
    const parsed = new URL(url)
    return SUPPORTED_HOSTS.some((host) => parsed.hostname.includes(host))
  } catch {
    return false
  }
}

const isViewerPage = (url: string) => VIEWER_PATHS.some((path) => url.includes(path))

const extractVideoId = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get("id") ?? parsed.searchParams.get("tid")
  } catch {
    return null
  }
}

export const Home = () => (
  <>
    <SignedOut>
      <SignedOutView />
    </SignedOut>
    <SignedIn>
      <PopupContent />
    </SignedIn>
  </>
)

// Progress bar component
const ProgressBar = ({ progress }: { progress: UploadProgress }) => {
  const getPhaseColor = () => {
    switch (progress.phase) {
      case "downloading":
        return "#3b82f6" // blue
      case "uploading":
        return "#8b5cf6" // purple
      case "processing":
        return "#f59e0b" // amber
      case "done":
        return "#22c55e" // green
      case "error":
        return "#ef4444" // red
      default:
        return "#6b7280" // gray
    }
  }

  const isIndeterminate = progress.phase === "processing" && progress.percent === 0

  return (
    <div className="progress-container">
      <div className="progress-bar-wrapper">
        <div
          className={`progress-bar ${isIndeterminate ? "indeterminate" : ""}`}
          style={{
            width: isIndeterminate ? "100%" : `${progress.percent}%`,
            backgroundColor: getPhaseColor()
          }}
        />
      </div>
      <div className="progress-message">{progress.message}</div>
      {progress.method && (
        <div className="progress-method">
          {progress.method === "primary" ? "Direct upload" : "Server processing"}
        </div>
      )}
    </div>
  )
}

const PopupContent = () => {
  const { getToken } = useAuth()
  const [tabId, setTabId] = useState<number | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [selectedCourse, setSelectedCourse] = useState("")
  const [status, setStatus] = useState<StatusState>(null)
  const [pageInfo, setPageInfo] = useState("Loading current page…")
  const [pageInfoIsError, setPageInfoIsError] = useState(false)
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [backendUrl, setBackendUrl] = useState("")
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)

  const statusTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light")
    return () => {
      document.documentElement.removeAttribute("data-theme")
      if (statusTimer.current) {
        clearTimeout(statusTimer.current)
      }
    }
  }, [])

  // Listen for progress updates from content script
  const handleProgressMessage = useCallback(
    (message: { action: string; progress?: UploadProgress }) => {
      if (message?.action === "progressUpdate" && message.progress) {
        setUploadProgress(message.progress)

        // Auto-clear progress after completion or error
        if (message.progress.phase === "done" || message.progress.phase === "error") {
          setTimeout(() => {
            setUploadProgress(null)
          }, 3000)
        }
      }
    },
    []
  )

  useEffect(() => {
    chrome.runtime.onMessage.addListener(handleProgressMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(handleProgressMessage)
    }
  }, [handleProgressMessage])

  const showStatus = (type: StatusState["type"], message: string) => {
    setStatus({ type, message })
    if (statusTimer.current) {
      clearTimeout(statusTimer.current)
    }
    statusTimer.current = setTimeout(() => setStatus(null), 5000)
  }

  const hydrateFromTab = async () => {
    try {
      const tab = await queryActiveTab()
      if (!tab || !tab.url) {
        setPageInfo("Unable to read the active tab.")
        setPageInfoIsError(true)
        setIsLoadingCourses(false)
        return
      }

      if (typeof tab.id === "number") {
        setTabId(tab.id)
      }

      if (!isPanoptoHost(tab.url)) {
        setPageInfo("Not on a Panopto page.")
        setPageInfoIsError(true)
        setIsLoadingCourses(false)
        return
      }

      if (!isViewerPage(tab.url)) {
        setPageInfo("Navigate to a Panopto Viewer or Embed page.")
        setPageInfoIsError(true)
        setIsLoadingCourses(false)
        return
      }

      const detectedVideoId = extractVideoId(tab.url)
      if (!detectedVideoId) {
        setPageInfo("Could not detect a video id.")
        setPageInfoIsError(true)
        setIsLoadingCourses(false)
        return
      }

      setVideoId(detectedVideoId)
      setPageInfo(`Video ID: ${detectedVideoId}`)
      setPageInfoIsError(false)
      await loadCourses()
    } catch (error) {
      console.error(error)
      setPageInfo(error instanceof Error ? error.message : "Failed to inspect the current page.")
      setPageInfoIsError(true)
      setIsLoadingCourses(false)
    }
  }

  useEffect(() => {
    void hydrateFromTab()
  }, [])

  const loadCourses = async () => {
    setIsLoadingCourses(true)
    try {
      const settings = await getSettings()
      const resolvedBackend = settings.backendUrl?.trim() || DEFAULT_BACKEND_URL
      setBackendUrl(resolvedBackend)

      const headers: Record<string, string> = { "Content-Type": "application/json" }
      const sessionToken = (await getToken?.()) ?? undefined
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`
      } else if (settings.apiKey) {
        headers.Authorization = `Bearer ${settings.apiKey}`
      }

      const response = await fetch(`${resolvedBackend}/api/courses`, {
        method: "GET",
        headers
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch courses (HTTP ${response.status})`)
      }

      const payload = (await response.json()) as RawCourse[] | { courses?: RawCourse[] }
      const rawCourses = Array.isArray(payload) ? payload : payload.courses ?? []

      if (!Array.isArray(rawCourses) || rawCourses.length === 0) {
        setCourses([])
        setSelectedCourse("")
        showStatus("info", "No courses found. Add your first course in Study Buddy.")
        setIsLoadingCourses(false)
        return
      }

      const normalized = rawCourses
        .map((course) => {
          const rawId = course.id ?? course.course_id ?? course.code ?? course.course_code
          const code = course.code ?? course.course_code ?? ""
          const name = course.name ?? course.course_name ?? ""
          const label = code && name ? `${code} - ${name}` : name || code || "Untitled course"

          if (!rawId) {
            return null
          }

          return {
            id: String(rawId),
            label
          }
        })
        .filter(Boolean) as CourseOption[]

      if (normalized.length === 0) {
        setCourses([])
        setSelectedCourse("")
        showStatus("info", "Courses response did not include identifiers.")
      } else {
        setCourses(normalized)
        setSelectedCourse("")
      }
    } catch (error) {
      console.error("Error loading courses:", error)
      setCourses([])
      setSelectedCourse("")
      showStatus("error", error instanceof Error ? error.message : "Error loading courses")
    } finally {
      setIsLoadingCourses(false)
    }
  }

  const handleSend = async () => {
    if (!selectedCourse) {
      showStatus("error", "Please select a course first.")
      return
    }

    if (!tabId || !videoId) {
      showStatus("error", "Missing tab or video information.")
      return
    }

    const sessionToken = (await getToken?.()) ?? undefined

    setIsSending(true)
    setUploadProgress({
      phase: "processing",
      percent: 0,
      message: "Starting..."
    })
    setStatus(null) // Clear any previous status

    try {
      const response = await sendMessage<{
        success: boolean
        message?: string
        error?: string
        lectureId?: string
        method?: "primary" | "fallback"
      }>(tabId, {
        action: "downloadVideo",
        courseId: selectedCourse,
        sessionToken
      })

      if (response?.success) {
        const lectureHint = response.lectureId ? ` (ID: ${response.lectureId})` : ""
        const methodHint = response.method === "primary" ? " [Direct]" : " [Server]"
        showStatus("success", `${response.message ?? "Upload complete!"}${lectureHint}${methodHint}`)
      } else {
        showStatus("error", response?.error ?? "Unknown error")
      }
    } catch (error) {
      console.error("Error sending message:", error)
      showStatus("error", error instanceof Error ? error.message : "Failed to contact content script")
    } finally {
      setIsSending(false)
    }
  }

  const buttonDisabled =
    !selectedCourse || isLoadingCourses || !videoId || !tabId || pageInfoIsError || isSending

  const statusClassName = useMemo(() => {
    if (!status) {
      return "status"
    }
    return `status ${status.type} is-visible`
  }, [status])

  const buttonText = useMemo(() => {
    if (!isSending) return "Send to Study Buddy"

    if (uploadProgress) {
      switch (uploadProgress.phase) {
        case "downloading":
          return "Downloading..."
        case "uploading":
          return "Uploading..."
        case "processing":
          return "Processing..."
        default:
          return "Sending..."
      }
    }

    return "Sending..."
  }, [isSending, uploadProgress])

  return (
    <div className="extension-card">
      <header className="popup-header">
        <h3>Study Buddy</h3>
        <UserButton />
      </header>

      <div className={`page-info ${pageInfoIsError ? "error" : ""}`}>{pageInfo}</div>

      <label htmlFor="course-select">Send to Course:</label>
      <select
        id="course-select"
        disabled={isLoadingCourses || courses.length === 0 || isSending}
        value={selectedCourse}
        onChange={(event) => setSelectedCourse(event.target.value)}>
        <option value="">
          {isLoadingCourses
            ? "Loading courses..."
            : courses.length === 0
              ? "No courses available"
              : "-- Select a course --"}
        </option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.label}
          </option>
        ))}
      </select>

      {uploadProgress && isSending && <ProgressBar progress={uploadProgress} />}

      <div className={statusClassName}>{status?.message}</div>

      <button disabled={buttonDisabled} onClick={handleSend}>
        {buttonText}
      </button>

      <div className="help-text">
        Backend: {backendUrl || "Not configured"} <br />
        Courses refresh automatically on popup open.
      </div>
    </div>
  )
}

const SignedOutView = () => (
  <div className="extension-card" style={{ minHeight: 420 }}>
    <h3>Study Buddy</h3>
    <p className="page-info">Sign in with Clerk to continue.</p>
    <SignInButton mode="modal">
      <button>Sign in</button>
    </SignInButton>
  </div>
)

export default Home
