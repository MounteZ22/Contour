# Contour

Contour is an early-stage local tool for organizing research context before collaborating with external AI agents.

Its goal is not to replace researchers or become a full agent platform. The aim is simpler and more practical:

> help a researcher collect project background, cycle history, claims, evidence, and uncertainty into a structured vault, then generate a task-specific context pack that can be handed to an external AI tool.

In short, Contour is trying to improve the part that often fails first in AI collaboration:

- the human knows the real project background
- the AI only sees a narrow prompt
- previous decisions, failed paths, and uncertainty are missing

Contour tries to narrow that gap with a lightweight Markdown/YAML workflow.

## What Contour Does

At the current stage, Contour focuses on a small core loop:

1. maintain a local research vault
2. store project notes, cycle records, claims, and linked assets
3. validate that the vault structure and references make sense
4. build a context pack for one specific task
5. give that pack to an external AI tool for discussion, analysis, or drafting

In the long run, Contour may still grow into a richer framework, including local GUI layers, integration with existing agent systems, or stronger context orchestration and collaboration mechanisms. At this stage, though, the focus is still on getting the small core right first.

## Current Status

Contour is still at an early prototype stage.

The current milestone is a CLI-first foundation with three commands:

- `contour init`
- `contour validate`
- `contour build-context`

## Repository Layout

If you are exploring the project for the first time, these paths matter most:

- [example_vault](example_vault): example research vault
- [contour/cli.py](contour/cli.py): CLI entrypoint
- [contour/validators.py](contour/validators.py): vault validation logic
- [contour/context_builder.py](contour/context_builder.py): context pack generation
- [README.md](README.md): Chinese main readme

## Quick Start

Using `uv`:

```bash
uv venv
uv pip install -e .[dev]
```

Using plain `pip`:

```bash
python -m pip install -e .[dev]
```

Validate the example vault:

```bash
python -m contour validate .\example_vault
```

Build a context pack:

```bash
python -m contour build-context ^
  --vault .\example_vault ^
  --task "Discuss the interpretation of PA-PVDF flux decline in FGDW" ^
  --cycles C001 C002 ^
  --claims CLM_001 ^
  --assets DA_001 DA_002
```

## Design Direction

The project currently follows a few simple principles:

- context before agent capability
- files before databases
- human confirmation over automatic memory
- small core before large platform

Those principles may evolve, but they are the current guardrails for keeping the project useful and understandable.

## Notes

This repository is still in a formative stage. As real usage grows, its structure, templates, and workflows will likely continue to change.
