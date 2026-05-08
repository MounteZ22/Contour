# Contour

Contour is a local-first research cognition workbench for experimental scientists in chemistry, biology, materials science, and related fields.

It is not a replacement for researchers, nor a general-purpose AI agent platform. Its role is simpler:

> Help researchers capture judgments, evidence, uncertainties, and failed paths from experiments, characterization, data analysis, and literature review into structured flows, claims, and documents. AI assists with organization, rewriting, and discussion around the current flow — but every formal record must be confirmed by the user.

## Product Shape

Flow-based research workspace for human-AI scientific collaboration.

```
One research project
→ multiple research flows
→ user-defined sections within each flow
→ AI collaborates around the current project / flow / section / selected text
```

## Current Status

Contour is transitioning from concept prototype to interactive product.

- **Done**: Markdown + YAML vault structure; file-system vault scanner; REST API for projects, flows, documents, and claims
- **Done**: React frontend — project dashboard, flow workspace (read / edit / add / delete sections), background document reader
- **In progress**: AI Chat Panel, Context Builder, Draft Review
- **Later**: Electron desktop packaging

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React 19 + TypeScript + react-router-dom |
| Backend | Node.js + Express + TypeScript |
| Data | Markdown + YAML frontmatter + filesystem (no database) |
| Markdown | gray-matter + react-markdown |

## Quick Start

```bash
# Backend (port 3001)
cd contour-web/backend
npm install
npm run dev

# Frontend (port 3000, proxies /api to backend)
cd contour-web/frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The vault path defaults to `D:\Contour`.

The directory is auto-created on first launch. To use a custom path, edit `~/.contour/settings.json`:
```json
{ "vaultsPath": "/your/vault/path" }
```

## Core Design Principles

- **Knowledge structure first**, not AI-first
- **Activate the human, don't replace them** — AI proposal → user review → formal record
- **Failed paths are first-class citizens** — preserve excluded approaches, anomalous data, unexplained phenomena
- **Progressive disclosure** — AI collaboration injects flow summaries by default; details fetched on demand
- **Files before databases** — vaults work with Obsidian, VS Code, and Git out of the box
