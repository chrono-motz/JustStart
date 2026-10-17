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

The browser/PWA MVP remains available, and a small Electron shell now provides native resource opening and login auto-start. The Auto-start switch controls the opening screen in the browser and also updates OS login auto-start when running in Electron.

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
