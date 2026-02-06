// Panopto Delivery Info types
export interface DeliveryInfo {
  sessionId: string
  sessionName: string
  duration: number
  masterPlaylistUrl: string
  sourceUrl: string
}

// Progress tracking
export interface UploadProgress {
  phase: "idle" | "extracting" | "processing" | "done" | "error"
  percent: number
  message: string
  current?: number
  total?: number
}

// Message types for content script <-> popup communication
export interface ImportLectureMessage {
  action: "importLecture"
  courseId: string
  sessionToken?: string
}

export interface BatchImportMessage {
  action: "batchImport"
  sessionIds: string[]
  courseId: string
  sessionToken?: string
}

export interface ProgressUpdateMessage {
  action: "progressUpdate"
  progress: UploadProgress
}

export type ContentScriptMessage = ImportLectureMessage | BatchImportMessage | ProgressUpdateMessage

// Response types
export interface ImportResult {
  success: boolean
  message?: string
  error?: string
  lectureId?: string
}

export interface BatchImportResult {
  success: boolean
  results: Array<{
    sessionId: string
    success: boolean
    lectureId?: string
    error?: string
  }>
}

export interface LectureStreamResponse {
  lecture_id: string
  status: string
}

// Stream payload sent to backend
export interface StreamPayload {
  streamUrl: string
  sessionId: string
  courseId: string
  title: string
  sourceUrl: string
  duration?: number
}

// HLS playlist variant
export interface HlsVariant {
  bandwidth: number
  url: string
}
