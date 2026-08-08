# Contour

> A local-first AI research workbench — turning thinking, experiments, and discussions into structured research threads, with a guarded-file-access Agent to help you read, organize, and move forward.

Contour is built for researchers and deep knowledge workers. It uses **Markdown + YAML files** as its single data format (no database, no lock-in), organizes research processes as a **network of Flow work units**, and ships with an Agent powered by the **Pi SDK** that works around your current context to help with reading, organizing, and advancing your work. Formal records are always confirmed by you.

## What It Can Do

### Research-thread Visualization (ContourMap)
- DAG auto-layout (strongly-connected-component condensation + topological layering) renders the Flow dependency network as a browsable research-path canvas
- Flow card hover previews title / status / AI summary; Claims are visually linked to Flows (badges + confidence color scale)
- Create child Flows directly on the canvas, or multi-select nodes to add to Agent context

### Flow Workspace
- Three-panel layout: Section navigation + Markdown reading/editing + AI collaboration entry
- Each Flow has custom sections, status (in_progress / done / etc.), attachments (`attachments/`), and external links
- Generate `flow_summary.md` in one click (legacy `context_summary.md` remains readable)

### Agent Conversation (Pi SDK)
- **Guarded file access**: the Agent's file tools may only touch the current project Vault, attached paths, exact files, and the session workspace — a path in the prompt is not authorization
- **Permission modes**: `readonly` (read-only) / `review` (confirm each write) / `yolo` (everything open)
- **Plan Mode**: the Agent researches first, produces a plan, and waits for your approval before executing
- **AskUser structured questions**: single-choice / multi-choice / text input, embedded in the conversation
- **Tool-call visualization**: what tool ran, what was passed, what came back — grouped by turn, with a per-turn changed-files summary
- **@ context mentions**: reference Flows / Documents in the input to inject Agent context
- **Message history recovery**: session JSONL is stream-parsed into a scrollable, turn-grouped history view; supports stop generation, retry, auto-naming, and draft persistence
- **Web search**: built-in Tavily Web Search (SSRF / DNS / credential-redaction hardened)

### Extensions & Integrations
- **MCP plugins**: per-project stdio MCP servers, command allowlist + per-invocation confirmation
- **Built-in previews**: PDF and Excel rendered in-app
- **Multi-channel models**: configure multiple LLM channels; pick a model per session

## Core Concepts

- **Project** — One research topic maps to one project, containing Flows, Documents, Claims, and its own Agent sessions.
- **Flow (work unit)** — An experiment, an argument, or a self-contained cognitive unit that can produce a conclusion. Flows form a dependency network (DAG) via `parentFlows` — a research path that keeps branching and advancing.
- **Document (background)** — Literature notes, methodology summaries, and other background knowledge that provide a "commonsense layer" for Flows and are injected on demand during AI collaboration.
- **Claim** — A conclusion statement, optionally linked to Flows and Documents, annotated with confidence; multiple Claims form a project's research-proposition network.
- **Agent session** — An independent AI conversation per project, with its own local working directory and message history, able to reference Flows / Documents as context.

All data is plain files — manage it directly with Obsidian, VS Code, or Git.

## Product Forms

Contour offers two ways to run it, sharing the same backend, data directory, and Agent core:

| Form | Description |
|------|-------------|
| **Web app** | Local React frontend + Express backend (`127.0.0.1:3000` / `:3001`) |
| **Electron desktop** | Same frontend + a process-embedded loopback API server, packageable as Windows / macOS installers; system tray, single-instance lock, and window-state memory |

## Quick Start

The project is an npm workspaces monorepo. Install dependencies from the repository root:

```bash
git clone https://github.com/MounteZ22/Contour.git
cd Contour
npm install
```

### Web development

```bash
npm run web:dev   # starts backend (127.0.0.1:3001) + frontend (127.0.0.1:3000)
```

Open `http://127.0.0.1:3000`.

### Desktop development / packaging

```bash
npm run desktop:dev     # build and launch the Electron dev environment
npm run desktop:build   # production package → apps/desktop/release/
```

### Other commands

```bash
npm run typecheck       # full-repo type checking
npm run test            # full-repo tests
npm run build           # full-repo build
```

## Local Data

The config directory follows the system home: `~/.contour` (production) / `~/.contour-dev` (development). The Vault data directory defaults to:

| Mode | Default path |
|------|--------------|
| Development | `~/Contour-dev` |
| Production | `~/Contour` |

To customize the Vault path, edit `~/.contour/settings.json` (or `~/.contour-dev/settings.json`):

```json
{ "vaultsPath": "your vault path" }
```

Agent sessions use a dual identity: the frontend and API always use the stable Contour `sessionId`, while the Pi SDK's own `sdkSessionId` lives only in the backend registry for model-context recovery. Each session has its own isolated local working directory — the project Vault is never used directly as the Agent cwd.

## Architecture

```
npm workspaces monorepo
├── packages/shared   cross-platform shared types & chat contracts (pure types, no runtime deps)
├── packages/core     business core: Agent runtime (Pi SDK), services, tools, vault
├── apps/web/backend  Express API host (composition root createWebHostContext, multi-host capable)
├── apps/web/frontend React + Vite frontend
└── apps/desktop      Electron desktop (process-embedded Express, tray / IPC / preload)
```

### Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + Vite + TypeScript + Tailwind v4 + ShadcnUI-style components |
| Routing / State | React Router v7 + Jotai |
| Virtual list | @tanstack/react-virtual |
| Backend | Node.js + Express + TypeScript |
| Agent | Pi SDK (`@earendil-works/pi-coding-agent`) |
| MCP | @modelcontextprotocol/sdk (stdio bridge) |
| Data | Markdown + YAML frontmatter + file system (no database) |
| Desktop | Electron 43 + electron-builder |

## Development

Development requires Node.js 21+.

- Full-repo commands are in "Quick Start"; per-package commands use `npm run <script> -w <workspace>` (e.g. `npm run build -w @contour/core`)
- Tests: Vitest, ~400+ cases across the repo
- Type checking: `npm run typecheck`

## Acknowledgements

Contour would not exist without the following open-source projects and tools:

- **[Proma](https://proma.cool)** — the vast majority of this project's development (architecture discussions, coding, testing, and code review) was done inside Proma; Proma's desktop app and Agent architecture are also a major reference for Contour.
- **[Pi SDK](https://github.com/earendil-works/pi)** (`@earendil-works/pi-coding-agent`) — the Agent runtime core; sessions, tools, and the permission system are all built on it.
- **[Cherry Studio](https://github.com/CherryHQ/cherry-studio)** and **[Chatbox](https://github.com/Bin-Huang/chatbox)** — product-form inspiration for multi-provider desktop AI apps.
- **[ShadcnUI](https://ui.shadcn.com/)** — UI component style and design language.
- **[TanStack Virtual](https://tanstack.com/virtual)** — virtual scrolling for long sessions.

## Contributing

Bug fixes, documentation, tests, and UX improvements are welcome — as are new Skills, MCP configs, or Agent workflows around real research scenarios.

Before opening a PR, please confirm:

- Use npm / workspaces; don't mix pnpm / bun lockfiles.
- Use Jotai for state management.
- Stay local-first; prefer config files; don't introduce a local database.
- No `any` in TypeScript; prefer `interface` for object structures.
- When adding IPC, update shared types, the main handler, the preload bridge, and the renderer caller together.
- Cover behavior with tests where feasible (Vitest).

## License

Contour is open-sourced under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE). See the root `LICENSE` file for full terms.

**Personal / non-commercial use**: free to use, modify, and distribute, subject only to AGPL-3.0.

**Commercial use**: permitted while fully complying with AGPL-3.0 — including but not limited to distributing the software in source or modified form, and making complete modified source (including network interaction layers) publicly available when offering the software as a network service; derivative works must remain AGPL-3.0.

**Commercial licensing (AGPL-3.0 exemption)**: if you wish to integrate Contour into closed-source products or offer SaaS without disclosing derivative code, or have other commercial scenarios that cannot satisfy AGPL-3.0, contact the maintainer via GitHub Issues or Discussions.

By submitting a Pull Request, you agree to license your contribution under AGPL-3.0 and future commercial licensing terms.
