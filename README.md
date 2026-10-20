# Just Start

> Reducing Friction by instantly starting.

Just Start is a cloud-synced, AI-assisted study and research workspace. It turns a large, messy collection of notes, slides, papers, problem links, videos, and question packs into organized topics, a completion-aware learning path, and a visual dependency graph that works across laptop and phone.

## Why it exists

Most learning tools make people plan, classify, and upload resources before they can begin. Just Start removes that setup burden: users can import an entire collection, let their own AI prepare a structured manifest, review the result, and immediately see the next useful action.

## Buildathon highlights

- **Instant start:** completion-aware recommendations turn a large plan into one useful next step.
- **Interactive graph:** dependencies become a calm, navigable map with progress-filled nodes, arrows, zoom, drag, and click-to-inspect details.
- **AI Bulk Intake:** ChatGPT can inspect a full folder or ZIP and create a downloadable `manifest.json` instead of forcing users to add resources one by one.
- **Incremental imports:** download `AGENTS.md` and `JUSTSTART_CONTEXT.json`; existing topics and resources are reused or skipped while only new material is added.
- **Broad resource support:** PDFs, slides, documents, papers, question packs, problem links, YouTube links, and other files.
- **Cloud workspace:** Supabase Auth, Postgres, and private Storage keep the same workspace available across devices.
- **Deployable anywhere:** Vercel hosts the static frontend; the laptop does not need to stay on after deployment.
- **Safe fallback:** local browser persistence keeps the app usable before sign-in or during a temporary cloud failure.

## Current MVP

- Modern, minimal launch screen with one recommended action.
- Completion-aware prerequisite graph for course material, with a concise interactive visual map, progress-filled nodes, dependency arrows, click-to-inspect details, zoom, and drag-to-explore navigation.
- Deadline, importance, unlock value, and startability influence selection.
- Partial completion, done, skip, and “worked elsewhere” actions.
- Sample Compiler Design and Operating Systems study data.
- Sample question files in `SampleQuestions/` for later quiz generation and import testing.
- Local browser preview for the sample resource cards.
- Local progress persistence through browser storage.
- Installable browser manifest for a distraction-free standalone window.
- Persisted light/dark mode from the sidebar.
- Optional Supabase cloud sync for the same workspace, files, and completions on phone and laptop.
- AI Bulk Intake for importing a validated collection of topics, local files, and problem links in one reviewable pass.
- Add files or whole folders with any file extension; imported resources are automatically classified and added as concise plan nodes.
- Create new focus areas and topics, attach imported children to an existing topic, and remove topics or whole focus areas as plans change.
- Import compact JSON or Markdown question packs with optional answers and worked solutions; see `QuestionPacks/README.md`.
- Create a Research Library focus area. Research PDFs and citation files are grouped by broad topic without prerequisite gates; filename metadata such as title, author pattern, year, and DOI is inferred locally.

The browser/PWA is the primary experience, and a small Electron shell provides native resource opening and login auto-start. The Auto-start switch controls the opening screen in the browser and also updates OS login auto-start when running in Electron. Use the **Dark mode** control in the sidebar to switch themes; the preference is stored locally. On a phone, use **Add resources** or **Add folder** for files available on that phone; after cloud upload, the same resources can be accessed from another device.

Research is intentionally a different mode from coursework: it is a shelf for broad reading and triage, not a directed learning graph. Later work can add DOI/API enrichment, duplicate detection, paper notes, reading queues, and citation links without changing the study graph semantics.

Use **Add resources** for individual files or **Add folder** in **My plan** for a directory. The picker accepts all file types. On phone or desktop, add files from the device where they are available; files left only on another device must be moved or added there first. Large collections are kept concise: the plan initially shows eight resources per focus area and offers a “show more” control rather than rendering hundreds at once. Without cloud sync, imported browser files are available immediately in the current session and must be added again after a reload because object URLs are temporary. After signing in to Supabase, the workspace is stored in Postgres and uploaded resources are stored in a private Storage bucket.

## Supabase cloud sync

Supabase is optional. Without configuration, Just Start remains local-only. With it, click **Sign in to sync** in the sidebar and request a passwordless email link. Supabase provides authentication, Postgres workspace storage, and private file storage without requiring a custom backend for this browser app.

Create a Supabase project, run `supabase/schema.sql` in the Supabase SQL Editor, and put only the browser-safe project settings in a local `.env` file:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

The publishable key is safe to expose in the browser when the included Row Level Security policies are installed. Never put a Supabase secret/service-role key in `.env`, source code, Vite client configuration, or the repository. Each self-hosting user can create their own Supabase project and provide their own URL and publishable key.

For local development, configure the Supabase Auth URL settings to allow the origin where the app is running, for example:

```text
http://localhost:5173
```

The same Supabase account can sign in from a phone and laptop, so progress and private resources can sync without being on the same Wi-Fi. The app loads the workspace after sign-in, saves changes after a short debounce, and checks for changes on the other device every 30 seconds. Add the deployed site URL to Supabase Auth's allowed redirect URLs before testing magic links. Existing local folders must be selected once with **Add folder** so Just Start can upload them; a browser cannot scan private laptop folders automatically.

## AI Bulk Intake

For large collections, open **AI bulk intake** and click **Download AGENTS.md**. Give that downloaded file to your own ChatGPT conversation together with the attached files, ZIP, folder structure, problem links, and YouTube links. Ask the agent to inspect the collection and return JSON only in the documented `1.0` manifest format. The manifest can propose topics, file resources, HTTP(S) problem links, descriptions, difficulty, estimated time, research metadata, and evidence-based item prerequisites, including confidence, thresholds, reasons, and `ALL`/`ANY` rules.

In Just Start, choose **AI bulk intake**, select the manifest JSON or a ZIP containing `manifest.json`, select or unpack the matching source files, choose an existing or new focus area, and review the summary before importing. Invalid manifests are rejected with field-level errors; missing source files prevent approval. Existing topics are matched by name instead of duplicated, existing resources are skipped by stable AI ID or source path/URL, and new topics are created only when they have new resources. The app then creates the new resources, preserves AI-provided dependency details in the graph, uploads files to private Supabase Storage when signed in, and keeps ordinary URLs as links. This Phase 1 flow intentionally keeps the AI outside the database: the agent prepares a portable bundle, while Just Start validates and commits it.

To start fresh before a new collection, use **Clear resources** in the sidebar and confirm. This removes the current workspace nodes and, when signed in, attempts to remove their private Supabase Storage files too; it does not delete repository fixture files.

## Requirements

- Node.js `22.23.3` (see `.nvmrc`)
- npm `10.9.9` (also recorded in `package.json`)

## Setup

```bash
npm ci
```

## Run

```bash
npm run dev
```

Open the local URL printed by Vite.

## Phone access on the same Wi-Fi

Run the app on the laptop with:

```bash
npm run dev:network
```

Find the laptop's local IP address, then open `http://<laptop-ip>:5173` on the phone. The phone and laptop must be on the same network and the laptop firewall must allow port `5173`. You can install the page as a PWA from the phone browser; the manifest includes an app icon. Files can be added and opened from the phone itself; this browser MVP does not expose private laptop files directly to a phone.

The OmniRush sandbox is not the same network as your phone or laptop. A sandbox `localhost` URL cannot be used as a phone address. Running `npm run dev:network` is only a local development test, so the laptop must stay on for that URL to work. Supabase does not host the Vite website; it hosts the account, workspace database, and private files. For the actual phone-and-laptop workflow when the laptop may be off, deploy `dist/` to a static host such as Cloudflare Pages, Netlify, GitHub Pages, or Vercel. Set the two Supabase variables in that host's build settings, add the deployed HTTPS URL to Supabase Auth, and open that same HTTPS URL on both devices. Sign in with the same email on both devices; the deployed site loads from the static host while Supabase supplies the shared data.

## Test

```bash
make test
```

The test command is offline after dependencies have been installed.

## Build

```bash
npm run build
```

The generated `dist/` directory is static and can be hosted on a free static host such as Cloudflare Pages, GitHub Pages, or Netlify. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in that host's build environment and add the deployed HTTPS origin to Supabase Auth's allowed URL list. After deployment, the PWA can be opened from phone or laptop anywhere with an internet connection.

## Deploy a static build

1. Run `npm ci` with Node.js `22.23.3`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the deployment provider's build settings when cloud sync is wanted.
3. Run `npm run build`.
4. Publish the contents of `dist/` as the site's static files.
5. Add the deployed HTTPS origin to Supabase Auth's allowed URL list.

The repository is intentionally self-contained for clean Linux rebuilds: `.nvmrc` pins Node.js, `package-lock.json` pins npm dependencies, `.env.example` documents configuration without secrets, `make test` is the single offline test entry point after `npm ci`, and `Dockerfile` builds and serves the static app.

## Desktop shell

Build the renderer and launch the Electron shell against the built `dist/index.html`:

```bash
npm run build
npm run desktop
```

For desktop development, start Vite in one terminal and Electron in another. The shell will load `http://localhost:5173` when `JUST_START_DEV_SERVER=1`:

```bash
# terminal 1
npm run dev

# terminal 2
npm run desktop:dev
```

The shell keeps renderer JavaScript isolated from Node.js and exposes only `window.justStart.openResource(path)` and `window.justStart.setLoginAutoStart(enabled)`. Resource paths are checked to stay inside the app before Electron opens them with the operating system. On Linux, enabling login auto-start writes a user-level `just-start.desktop` file to `~/.config/autostart/`; Electron's login item API is used where supported.

## Docker

```bash
docker build -t just-start .
docker run --rm -p 4173:4173 just-start
```

Open `http://localhost:4173`.
