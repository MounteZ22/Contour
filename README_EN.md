# Contour

> A local-first cognition workspace — turning thinking, experiments, and discussions into structured knowledge threads.

## What This Is

Contour helps you turn the judgments, evidence, uncertainties, and dead ends from your work process into traceable, collaborative structured knowledge.

Most knowledge work is not linear. An experiment, a dataset, a discussion, a rejected hypothesis — these fragmented pieces of cognition need to be recorded, connected, and traced. Contour uses **Flows** to organize your work units. Each Flow contains custom sections, records of judgments and evidence, and tracking of unresolved questions. AI assists with organization and discussion around your current working context, but all formal records require your confirmation.

## Who This Is For

Anyone whose work involves **structured recording of cognitive processes, tracing the origins of judgments, and collaborative knowledge accumulation**:

- Experimental research and data analysis — documenting hypotheses, observations, conclusions, and open questions for every experiment
- Literature review and theory building — tracing sources of ideas, evidence chains, and reasoning processes
- Team knowledge management — maintaining a shared cognitive map for collaborative work, instead of fragmented information scattered across chat logs
- Personal knowledge bases — turning scattered notes into traceable, reusable structured knowledge

## Core Concepts

### Flow (Work Unit)

A self-contained cognitive unit that produces a judgment or conclusion. It can be:
- An experiment or data analysis
- A literature argument or theoretical derivation
- A discussion or decision record

Each Flow contains:
- **User-defined sections** — such as Methods, Results, Discussion, Next Steps (structure is not fixed)
- **Records of judgments and evidence** — what conclusions were formed, based on what evidence, with what confidence
- **Uncertainty tracking** — unresolved questions, rejected alternatives, unexplained phenomena
- **`flow_summary.md`** — provides the most relevant working context to AI (legacy `context_summary.md` remains readable)
- **Attachments and links** — Flow directories store owned files in `attachments/`; frontmatter `links` records external file references

### Document (Background)

Accumulated background knowledge — literature notes, methodology summaries, reference materials, etc. Documents provide the "commonsense layer" that supports Flows, and are injected on demand during AI collaboration.

### How They Relate

```
Project (a project)
├── Flows (network of work units, can form parent/child relationships)
│   ├── F001 Initial Exploration
│   ├── F002 Condition Optimization (based on F001)
│   └── F003 Verification Experiment (based on F002)
└── Documents (background document library)
    ├── Technical Review
    └── Methodology Reference
```

## Product Form

Contour is a locally running Web application and an Electron desktop MVP that share the same backend and business-data locations. The Web application has three core pages:

| Page | Function |
|------|----------|
| **Dashboard** | Project list + Work progress outline (ContourMap node canvas) |
| **Flow Workspace** | Three-panel layout: Section navigation + Markdown reading/editing + AI collaboration panel |
| **Background Library** | Reading and management of background documents |

All data is stored as Markdown + YAML frontmatter in your local file system. You can manage it directly with Obsidian, VS Code, or Git.

## Quick Start

The project uses npm workspaces. Install dependencies from the repository root:

```bash
# Clone the repository
git clone https://github.com/MounteZ22/Contour.git
cd Contour
npm install
```

Start the Web development environment (backend on `127.0.0.1:3001`, frontend on `127.0.0.1:3000`):

```bash
npm run web:dev
```

Open `http://127.0.0.1:3000`. Vault data is read from `D:\Contour` (Windows) or `~/Contour` (macOS/Linux) by default. The configuration directory and default Vault path are created on first launch. To customize the path, edit `~/.contour/settings.json`:

```json
{ "vaultsPath": "your vault path" }
```

Run the Electron desktop development environment:

```bash
npm run desktop:dev
```

A production desktop build packages the frontend with a same-origin API server bound only to `127.0.0.1`:

```bash
npm run desktop:build
```

The Electron window state is stored in Electron's `userData` directory. Business configuration, Agent session history, and Vault data continue to use the existing `~/.contour` and `vaultsPath` configuration.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React 19 + TypeScript + Tailwind v4 |
| Routing | React Router v7 |
| State Management | Jotai (theme state only) |
| Backend | Node.js + Express + TypeScript |
| Data | Markdown + YAML frontmatter + File system (no database) |
| Markdown | react-markdown + remark-gfm |

## Core Design Principles

- **Knowledge structure first**, not AI first
- **Augment humans, don't replace them** — AI proposal → user review → formal record
- **Failed paths are first-class citizens** — preserve rejected hypotheses, anomalous data, unexplained phenomena
- **Progressive disclosure** — AI collaboration injects flow summary by default, reads details on demand
- **Files over databases** — vault can be managed directly with Obsidian, VS Code, Git
- **Guarded file access** — Agent file tools are limited to the current project Vault, configured paths, exact files, and the session workspace; a path in the prompt is not authorization

## License

AGPL-3.0. See the complete terms in the root [LICENSE](LICENSE) file.
