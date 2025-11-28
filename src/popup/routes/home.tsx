import { SignInButton, SignedIn, SignedOut, UserButton, useAuth } from "@clerk/chrome-extension"
import { useEffect, useMemo, useRef, useState } from "react"

import { DEFAULT_BACKEND_URL, getSettings } from "~src/lib/storage"

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
    showStatus("info", "Getting video link…")

    try {
      const response = await sendMessage<{
        success: boolean
        message?: string
        error?: string
        lectureId?: string
      }>(tabId, {
        action: "downloadVideo",
        courseId: selectedCourse,
        sessionToken
      })

      if (response?.success) {
        const lectureHint = response.lectureId ? ` (Lecture ID: ${response.lectureId})` : ""
        showStatus("success", `${response.message ?? "Video sent to Study Buddy! ✓"}${lectureHint}`)
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
        disabled={isLoadingCourses || courses.length === 0}
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

      <div className={statusClassName}>{status?.message}</div>

      <button disabled={buttonDisabled} onClick={handleSend}>
        {isSending ? "Sending..." : "Send to Study Buddy"}
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
