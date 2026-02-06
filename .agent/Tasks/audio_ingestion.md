# Lecture Ingestion Feature

## Overview

This feature extracts HLS stream URLs from Panopto and sends them to the backend for processing. No file downloads happen in the extension - just metadata extraction and URL resolution.

## How It Works

1. User clicks "Import Lecture" on a Panopto viewer page
2. Extension POSTs to `/Panopto/Pages/Viewer/DeliveryInfo.aspx` with session ID
3. Parses response to get HLS master playlist URL (`StreamHttpUrl`)
4. Fetches the m3u8 playlist
5. Parses variants and picks the **lowest bandwidth** option
6. POSTs metadata + stream URL to backend `/api/lectures/stream`

## Key Files

| File | Role |
|------|------|
| `src/contents/panopto.tsx` | Extracts metadata, parses HLS, sends to backend |
| `src/popup/routes/home.tsx` | UI for course selection and import button |
| `src/lib/types.ts` | Type definitions |
| `src/background.ts` | Minimal - just notifications |

## API Endpoint

### Backend: `POST /api/lectures/stream`

```json
{
  "stream_url": "https://cloudfront.../variant.m3u8",
  "session_id": "uuid",
  "course_id": "string",
  "title": "Lecture Title",
  "duration": 3600,
  "source_url": "https://panopto.../Viewer.aspx?id=..."
}
```

## Batch Import

For multiple lectures, use the `batchImport` action with an array of session IDs:
- Processes 3 sessions concurrently
- Reports progress: `{current}/{total}`

## HLS Playlist Parsing

The extension:
1. Fetches the master playlist (m3u8)
2. Finds `#EXT-X-STREAM-INF` tags
3. Extracts `BANDWIDTH` values
4. Returns the variant URL with lowest bandwidth

This gives the backend the smallest possible stream to process.

## Why Lowest Bandwidth?

- Faster download for backend
- Less storage needed
- Audio quality is typically the same across variants
- Backend only needs audio anyway

## Progress States

| Phase | Message |
|-------|---------|
| extracting | "Fetching lecture info..." |
| processing | "Importing lectures..." (batch) |
| done | "Lecture imported!" |
| error | Error message |

---

**Related Docs:**
- [Project Architecture](../System/project_architecture.md)
