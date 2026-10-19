# Just Start

Just Start is a local-first study and research companion that removes the blank-page moment. It turns resources into a completion-aware path and presents one useful next action when you open the app.

## Current MVP

- Modern, minimal launch screen with one recommended action.
- Completion-aware prerequisite graph for course material.
- Deadline, importance, unlock value, and startability influence selection.
- Partial completion, done, skip, and “worked elsewhere” actions.
- Sample Compiler Design and Operating Systems study data.
- Sample question files in `SampleQuestions/` for later quiz generation and import testing.
- Local browser preview for the sample resource cards.
- Local progress persistence through browser storage.
- Installable browser manifest for a distraction-free standalone window.
- Persisted light/dark mode from the sidebar.
- Optional free Google Drive sync for the same workspace, files, and completions on phone and laptop.
- Add files or whole folders with any file extension; imported resources are automatically classified and added as concise plan nodes.
- Create new focus areas and topics, attach imported children to an existing topic, and remove topics or whole focus areas as plans change.
- Import compact JSON or Markdown question packs with optional answers and worked solutions; see `QuestionPacks/README.md`.
- Create a Research Library focus area. Research PDFs and citation files are grouped by broad topic without prerequisite gates; filename metadata such as title, author pattern, year, and DOI is inferred locally.

The browser/PWA MVP remains available, and a small Electron shell now provides native resource opening and login auto-start. The Auto-start switch controls the opening screen in the browser and also updates OS login auto-start when running in Electron. Use the **Dark mode** control in the sidebar to switch themes; the preference is stored locally. On a phone, use **Add resources** or **Add folder** for files available on that phone; the PWA cannot open files that remain only on another laptop.

Research is intentionally a different mode from coursework: it is a shelf for broad reading and triage, not a directed learning graph. Later work can add DOI/API enrichment, duplicate detection, paper notes, reading queues, and citation links without changing the study graph semantics.

Use **Add resources** for individual files or **Add folder** in **My plan** for a directory. The picker accepts all file types. On phone or desktop, add files from the device where they are available; files left only on another device must be moved or added there first. Large collections are kept concise: the plan initially shows eight resources per focus area and offers a “show more” control rather than rendering hundreds at once. Without Drive sync, imported browser files are available immediately in the current session and must be added again after a reload because object URLs are temporary. With Drive sync, uploaded files keep their Drive file IDs and remain available across devices.

## Free Google Drive sync

Google Drive is optional. Without configuration, Just Start remains local-only. With it, click **Connect Google Drive** in the sidebar and approve access through Google's OAuth page. No Google password or token is entered into Just Start chat or source files.

Create a Google Cloud project, enable the Google Drive API, configure an OAuth consent screen, add your Google account as a test user, and create a Web OAuth client. Put only the client ID in a local `.env` file:

```bash
cp .env.example .env
```

```env
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Add this authorized JavaScript origin during local development:

```text
http://localhost:5173
```

The app requests the limited `drive.file` scope and creates a private `JustStart` folder in Drive. It stores `workspace.json` plus uploaded resources there. The same Google account can connect from a phone and laptop, so progress and Drive-backed files can sync without being on the same Wi-Fi. Existing local folders must be selected once with **Add folder** so Just Start can upload them; a browser cannot scan private laptop folders automatically.

Use the same Google OAuth client ID for local and production builds, and add every allowed origin to that client. This keeps files created by Just Start under one app identity when you move between localhost and the deployed website.

Google Drive provides free quota within your account limits. This browser-only integration does not require a paid backend. OAuth test-mode restrictions still apply until you publish or verify the OAuth consent screen.

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

Find the laptop's local IP address, then open `http://<laptop-ip>:5173` on the phone. The phone and laptop must be on the same network and the laptop firewall must allow port `5173`. You can install the page as a PWA from the phone browser. Files can be added and opened from the phone itself; this browser MVP does not expose private laptop files directly to a phone.

## Test

```bash
make test
```

The test command is offline after dependencies have been installed.

## Build

```bash
npm run build
```

The generated `dist/` directory is static and can be hosted on a free static host such as Cloudflare Pages, GitHub Pages, or Netlify. Set `VITE_GOOGLE_CLIENT_ID` in that host's build environment and add the deployed HTTPS origin to the Google OAuth client. After deployment, the PWA can be opened from phone or laptop anywhere with an internet connection.

## Deploy a static build

1. Run `npm ci` with Node.js `22.23.3`.
2. Set `VITE_GOOGLE_CLIENT_ID` in the deployment provider's build settings when Drive sync is wanted.
3. Run `npm run build`.
4. Publish the contents of `dist/` as the site's static files.
5. Add the deployed HTTPS origin to the Google OAuth client's authorized JavaScript origins.

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
