# Study Buddy Chrome Extension

Browser extension for sending Panopto recordings to the Study Buddy backend for transcription and downloads. Built with [Plasmo](https://docs.plasmo.com/), React 18, Clerk authentication, and a small React Router memory app for Clerk's routed pages.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) (repo was bootstrapped with pnpm; other package managers are not supported)
- Running Study Buddy backend API (default `http://localhost:8000`)

Install dependencies once after cloning:

```bash
pnpm install
```

## Environment Variables

Create `.env.development` (for dev builds) and `.env.chrome` (for packaged builds) with at least:

```
PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY=<your Clerk publishable key>
CLERK_FRONTEND_API=https://<your-subdomain>.clerk.accounts.dev
```

`CLERK_FRONTEND_API` is used in the manifest `host_permissions` so the extension may talk to Clerk. Keep these files out of git—`.gitignore` already covers them.

## Development Workflow

1. Start Plasmo dev mode:
   ```bash
   pnpm dev
   ```
2. In Chrome, visit `chrome://extensions`, enable **Developer Mode**, click **Load unpacked**, and point it at `build/chrome-mv3-dev`.
3. Navigate to a Panopto viewer tab, open the Study Buddy popup, sign in with Clerk, select a course, and send a recording. The content script fetches delivery info, extracts the podcast stream URL, and POSTs it to `/api/lectures/download` with the selected course.

### Routing & Auth

- The popup lives under `src/popup/` and uses `createMemoryRouter` to define `/`, `/sign-in`, `/sign-up`, and `/settings` routes.
- `ClerkProvider` is configured with `routerPush/routerReplace`, so Clerk can redirect between those paths. The signed-out popup still opens Clerk's modal, but the routed pages are available if Clerk needs a full view.

### Backend Configuration

- Default backend URL is `http://localhost:8000` (`src/lib/storage.ts`). Users can override it through extension settings (synced via `chrome.storage.sync`).
- The content script (`src/contents/panopto.tsx`) posts `{ course_id, panopto_url, stream_url, title }` to `/api/lectures/download` with either the logged-in Clerk session token or the saved API key.

## Building & Packaging

- Production build: `pnpm build` → output in `build/chrome-mv3/`
- Store-ready zip: `pnpm package`

Always smoke-test by reloading from the `build/chrome-mv3-dev` directory before shipping.

## Repository Structure Highlights

- `src/popup/` – popup React app (layouts, routes, styles)
- `src/contents/panopto.tsx` – content script injected on Panopto viewer pages
- `src/lib/storage.ts` – synced settings helpers
- `assets/` – extension icons
- `.plasmo/`, `build/`, `.pnpm-store/` – generated artifacts (ignored by git)

## Troubleshooting

- **Clerk 400 after clicking Sign Up** – ensure captcha/bot protection is disabled or configured for the chrome-extension origin; otherwise Clerk rejects the request.
- **Backend 422** – verify the request payload in Chrome DevTools Network tab includes `stream_url`. If it doesn't, reload the extension to pick up the latest content script bundle.
- **CORS errors** – make sure your backend allows requests from the Panopto origin you are testing (e.g., `https://*.panopto.com`).

Happy hacking!
