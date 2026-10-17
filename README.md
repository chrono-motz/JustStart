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
- Add files or whole folders with any file extension; imported resources are automatically classified and added as concise plan nodes.
- Create new focus areas and topics, attach imported children to an existing topic, and remove topics or whole focus areas as plans change.
- Import compact JSON or Markdown question packs with optional answers and worked solutions; see `QuestionPacks/README.md`.
- Create a Research Library focus area. Research PDFs and citation files are grouped by broad topic without prerequisite gates; filename metadata such as title, author pattern, year, and DOI is inferred locally.

The browser/PWA MVP remains available, and a small Electron shell now provides native resource opening and login auto-start. The Auto-start switch controls the opening screen in the browser and also updates OS login auto-start when running in Electron. Use the **Dark mode** control in the sidebar to switch themes; the preference is stored locally. On a phone, use **Add resources** or **Add folder** for files available on that phone; the PWA cannot open files that remain only on another laptop.

Research is intentionally a different mode from coursework: it is a shelf for broad reading and triage, not a directed learning graph. Later work can add DOI/API enrichment, duplicate detection, paper notes, reading queues, and citation links without changing the study graph semantics.

Use **Add resources** for individual files or **Add folder** in **My plan** for a directory. The picker accepts all file types. On phone or desktop, add files from the device where they are available; files left only on another device must be moved or added there first. Large collections are kept concise: the plan initially shows eight resources per focus area and offers a “show more” control rather than rendering hundreds at once. Imported browser files are available immediately in the current session; their metadata persists, but the browser asks you to add them again after a reload because object URLs are temporary.

## Requirements

- Node.js `22.23.3` (see `.nvmrc`)
- npm 10+

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
