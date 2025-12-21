# StudyBuddy Extension - Project Architecture

## Project Goal

StudyBuddy is a Chrome browser extension that extracts lecture recordings from Panopto and sends them to a backend service for transcription and processing. The extension enables students to easily capture lecture content for study purposes.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Plasmo 0.90.5 (Chrome MV3) |
| UI | React 18.2 |
| Routing | React Router 7.x |
| Authentication | Clerk (chrome-extension package) |
| Storage | Chrome Storage Sync API |
| Language | TypeScript 5.3 |
| Build | Plasmo bundler |

## Project Structure

```
src/
├── background.ts              # Service worker - handles CORS-bypassing fetches and uploads
├── contents/
│   └── panopto.tsx           # Content script - injected on Panopto pages
├── popup/
│   ├── index.tsx             # Popup entry point with React Router
│   ├── layouts/
│   │   └── root-layout.tsx   # ClerkProvider wrapper
│   └── routes/
│       ├── home.tsx          # Main UI - course selection, progress, upload
│       ├── sign-in.tsx       # Clerk sign-in
│       ├── sign-up.tsx       # Clerk sign-up
│       └── settings.tsx      # User profile
├── options.tsx               # Options page - backend URL configuration
├── lib/
│   ├── storage.ts            # Chrome storage helpers
│   └── types.ts              # Shared TypeScript types
└── styles/
    └── extension.css         # Global styles
```

## Extension Components

### Background Script (`background.ts`)
- Runs as a service worker (MV3)
- Handles audio fetching from Panopto CDN (bypasses CORS)
- Uploads audio directly to backend
- Sends progress updates to content script

### Content Script (`contents/panopto.tsx`)
- Injected on Panopto Viewer/Embed pages
- Extracts video metadata from Panopto's DeliveryInfo API
- Coordinates the upload flow (primary vs fallback path)
- Communicates with popup via Chrome messaging

### Popup (`popup/routes/home.tsx`)
- Main user interface
- Course selection dropdown
- Progress bar with phase indicators
- Status messages

### Options Page (`options.tsx`)
- Backend URL configuration
- API key management
- Health check functionality

## Integration Points

### Panopto API
- **DeliveryInfo API**: `POST /Panopto/Pages/Viewer/DeliveryInfo.aspx`
  - Returns session metadata, stream URLs, encoding status
- **Audio Podcast**: `GET /Panopto/Podcast/Download/{id}.mp4?mediaTargetType=audioPodcast`
  - Direct audio download (~75MB vs ~500MB video)

### Backend API
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/courses` | GET | List available courses |
| `/api/lectures/audio` | POST | Primary: Direct audio upload |
| `/api/lectures/download` | POST | Fallback: URL-based processing |
| `/api/health` | GET | Backend health check |

## Authentication

- **Clerk**: Primary authentication (JWT tokens)
- **API Key**: Fallback authentication (stored in chrome.storage.sync)
- Authorization header: `Bearer <token>`

## Manifest Permissions

```json
{
  "permissions": ["storage", "activeTab", "tabs", "scripting", "notifications", "cookies"],
  "host_permissions": [
    "https://*.panopto.com/*",
    "https://*.panopto.eu/*",
    "https://*.hosted.panopto.com/*",
    "http://localhost:8000/*",
    "http://localhost/*"
  ]
}
```

## Data Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Popup     │───►│  Content    │───►│ Background  │───►│  Backend    │
│             │    │  Script     │    │  Script     │    │             │
│ - Select    │    │ - Extract   │    │ - Fetch     │    │ - Store     │
│   course    │    │   metadata  │    │   audio     │    │ - Transcribe│
│ - Show      │    │ - Check     │    │ - Upload    │    │             │
│   progress  │    │   encoding  │    │   to API    │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

**Related Docs:**
- [Audio Ingestion Feature](../Tasks/audio_ingestion.md)
