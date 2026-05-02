# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start the unified Express + Vite server on port 3000 via `tsx server.ts`. Vite middleware mode is used unless `NODE_ENV=production` or `VERCEL=1`.
- `npm run build` — Production build via `vite build` (outputs to `dist/`).
- `npm run preview` — Vite preview of the built client.
- `npm run lint` — Type-check only (`tsc --noEmit`). There is no test runner configured.

Required env vars (`.env.local`, see `.env.example`):
- `GEMINI_API_KEY` — used server-side by `services/geminiService.ts` (NEVER exposed to the client).
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — served to the client via `GET /api/config/supabase`.
- `SUPABASE_SERVICE_ROLE_KEY` — backend ops only.

## Architecture

This is **UNSanctionGuard / RPME** (`package.json` name: `unsanctionguard`), a sanctions/KYC compliance app. It is a React 18 + Vite SPA fronted by an Express server that doubles as the dev server, prod static server, and Vercel serverless entry (see `vercel.json`).

### Single-process server (`server.ts`)
One Express app handles three roles:
1. **CORS-bypass proxy** at `GET /api/proxy?url=...` — used by `services/unSanctionsService.ts` to fetch UN/OFAC/Qatar NCTC sanctions sources from the browser without CORS issues.
2. **Server-side AI screening** at `POST /api/screening/advanced` — dynamically imports `services/geminiService.ts` and calls `performAdvancedScreening`. The Gemini key stays on the server.
3. **Static + SPA host** — in dev it mounts Vite as middleware; in prod (`NODE_ENV=production` or `VERCEL=1`) it serves `dist/` and falls through to `index.html` for non-`/api/*` routes. The listener is skipped under Vercel; `app` is exported as the serverless handler.

### Client/server boundary for AI
Per `RESTORE_POINT.md`, the Gemini call must remain server-side. The client (in `services/cloudDb.ts`) reaches AI screening only through `fetch('/api/screening/advanced', ...)`. Do not re-introduce a Vite `define` for the API key or call `@google/genai` from client code.

### Data layer (`services/cloudDb.ts`)
Initializes a Supabase client against a hardcoded **master registry** project (`MASTER_REGISTRY_URL` / `MASTER_REGISTRY_KEY` constants at the top of the file) — this is intentional shared infrastructure, not a leak. Exposes the bulk of app capabilities: clients CRUD, sanctions ingestion (`upsertCloudSanctions`, `deleteStaleSanctions`), realtime subscriptions, audit/system/ingestion logs, global sync lock and environment toggles, and entity screening (`screenEntityAgainstDb`, `screenEntityAdvanced`). It also imports the local `screenClient` heuristic from `services/screeningEngine.ts` for offline/preliminary scoring.

### Screening pipeline
Two-tier screening:
- **Heuristic** (`services/screeningEngine.ts`) — Levenshtein-based name similarity with a `CORPORATE_NOISE` token filter; returns a `MatchResult` with `RiskLevel`.
- **AI** (`services/geminiService.ts`) — structured JSON output from `@google/genai` using a fixed `SYSTEM_PROMPT` that defines weighted dimensions (Name 40%, Country 20%, ID 25%, DOB 10%, CRN 5%) and risk thresholds. Output conforms to `DetailedMatchReport` in `types.ts`.

### Sanctions ingestion (`services/unSanctionsService.ts`)
Fetches and normalizes from multiple authoritative lists (UN consolidated XML, Qatar NCTC HTML portal, OpenSanctions JSON, OFAC SDN CSV) through the local `/api/proxy`. `generateDeterministicId` produces stable fingerprint IDs when official refs are missing — preserve this when adding new sources to avoid duplicating entries.

### Frontend shell (`App.tsx`, `components/`)
Single root `App.tsx` (~700 lines) owns all global state: session, clients, sanctions count, sync state, screening progress, environment (Production/Sandbox), and audit logs. Routing is `HashRouter` with screens under `components/`: `Dashboard`, `ClientManager`, `SanctionsRegistry`, `AdminPanel`, `Login`, `LandingPage`, `PasswordUpdate`, plus `Layout`. Session is persisted in `localStorage` under `unsg_session`; registry stats under `unsg_registry_stats`.

### Types (`types.ts`)
Single source of truth for domain types (`Client`, `SanctionEntry`, `MatchResult`, `DetailedMatchReport`, `UserProfile`, `AppSettings`) and enums (`RiskLevel`, `KYCStatus`, `UserRole`, `SystemEnvironment`). `Client` uses string-literal field names with spaces (e.g. `"Client Name"`, `"QFC No"`) — these are the canonical column keys; do not rename.

### Defensive bootstrapping (`index.tsx`)
Re-defines `window.fetch` as writable before mounting React because some libraries try to assign to it; keep this shim if touching `index.tsx`.

## Conventions

- TypeScript `strict` is on; `noEmit` only. Build is done by Vite, not `tsc`.
- The repo contains a `backups/` directory of "stable" snapshots referenced in `RESTORE_POINT.md` — do not edit those copies; they are restore artifacts.
- Avoid changing the hardcoded `MASTER_REGISTRY_URL` / `MASTER_REGISTRY_KEY` or the `'unsg_*'` localStorage keys without coordinated migration logic — existing user sessions and registry stats depend on them.
