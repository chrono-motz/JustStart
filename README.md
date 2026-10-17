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

The current interface is a browser/PWA MVP. The Auto-start switch controls whether the app opens directly on the Start screen or the full plan. OS-level login auto-start and native file opening are intentionally left for the desktop shell integration; the data model already keeps source paths separate from display content.

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

## Docker

```bash
docker build -t just-start .
docker run --rm -p 4173:4173 just-start
```

Open `http://localhost:4173`.
