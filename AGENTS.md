# Repository Guidelines

## Project Structure & Module Organization
This project uses Plasmo’s `--with-src` layout, so every entry point lives in `src/` (`src/popup.tsx`, `src/options.tsx`, `src/background.ts`, `src/contents/...`). Shared hooks and helpers live alongside them in `src/lib`. Browser assets go under `assets/`. Build artifacts land in `build/`—never commit anything under that directory.

## Build, Test, and Development Commands
- `pnpm dev` (or `npm run dev`): launches Plasmo’s dev server and writes incremental builds to `build/<browser>-mv3-dev/` for hot reloading during local debugging.
- `pnpm build`: creates an optimized production bundle in `build/<browser>-mv3/` suitable for manual zipping.
- `pnpm package`: wraps the production build into store-ready ZIP archives; use after verifying the `build` output.

## Coding Style & Naming Conventions
TypeScript + React 18 are the default. Keep components functional, leverage hooks, and colocate CSS-in-JS or module styles beside the component file. Prettier (with `@ianvs/prettier-plugin-sort-imports`) enforces formatting—run `pnpm prettier --write .` before committing if your editor is not configured. Use 2-space indentation, single-quoted strings, and PascalCase for React components while utility modules and hooks use camelCase (e.g., `usePanoptoDownloader`). Keep popup UI state minimal and isolate Chrome API accessors in dedicated helper files.

## Testing Guidelines
There is no automated test suite yet, so rely on manual verification: run `pnpm dev`, load the unpacked extension from `build/chrome-mv3-dev`, and test downloading across multiple Panopto recordings. Record exploratory steps in the pull request until Jest or Playwright tests are added. When introducing complex logic, add small TypeScript modules that can later be unit-tested rather than embedding logic directly in JSX.

## Commit & Pull Request Guidelines
Existing history uses short imperative messages (“Add files”), so continue with `<verb> <scope>` phrasing (e.g., “Add panopto fetch hook”). Reference related issues in the body, and keep commits focused on one conceptual change to simplify reviews. Pull requests should include: a concise summary, screenshots or screen recordings of the popup if UI changed, reproduction/testing notes (commands executed, browsers tested), and any follow-up TODOs. Ensure CI-equivalent steps (`pnpm dev` smoke check or `pnpm build`) succeed before requesting review.

## Security & Configuration Tips
Never hardcode API keys for Clerk or Panopto; load secrets via environment variables supported by Plasmo (`.env` files are ignored by default—keep them local). Review `manifest.host_permissions` before expanding origins, and scope network calls to the minimum required domains to keep the extension approved by storefront reviewers.***
