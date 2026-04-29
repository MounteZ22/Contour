from __future__ import annotations

from pathlib import Path


class ContourError(RuntimeError):
    """Raised when a vault operation cannot be completed safely."""


REQUIRED_ROOT_DIRS = [
    "project",
    "cycles",
    "claims",
    "data_library",
    "drafts",
    "context_packs",
    "templates",
    "indexes",
]

DATA_LIBRARY_DIRS = [
    "data_library/raw",
    "data_library/processed",
    "data_library/plots",
    "data_library/scripts",
    "data_library/models",
]

DRAFT_DIRS = [
    "drafts/cycle_drafts",
    "drafts/claim_drafts",
    "drafts/analysis_drafts",
    "drafts/context_summary_drafts",
]

OPTIONAL_PROJECT_FILES = [
    "project/research_questions.md",
    "project/terminology.md",
    "project/writing_style.md",
    "project/system_definition.md",
]

PROJECT_FILES = {
    "project/project_brief.md": """# Project Brief

## Research Goal

Describe the core research question this vault supports.

## Current Stage

Document the current project stage and important constraints.
""",
    "project/research_questions.md": """# Research Questions

- Question 1
- Question 2
""",
    "project/terminology.md": """# Terminology

- Term:
  - Definition:
""",
    "project/writing_style.md": """# Writing Style

Capture phrasing preferences, caution rules, and target audience notes here.
""",
    "project/system_definition.md": """# System Definition

Describe the experimental system, boundary conditions, and long-term constraints.
""",
}

INDEX_FILES = {
    "indexes/cycle_index.yaml": "cycles: []\n",
    "indexes/claim_index.yaml": "claims: []\n",
    "indexes/asset_index.yaml": "assets: []\n",
}

FALLBACK_TEMPLATE_FILES = {
    "cycle.md.j2": """---
cycle_id: {{ cycle_id }}
title: {{ title }}
status: draft
created: {{ created }}
updated: {{ created }}
stage: {{ stage }}
parent_cycles: []
related_claims: []
related_assets: []
---

# {{ title }}

## 1. Why this cycle exists

## 2. Inputs

## 3. What was done

## 4. Key observations

## 5. Interpretation

## 6. Decision

## 7. Uncertainties

## 8. Next steps

## 9. Links
""",
    "claim.md.j2": """---
claim_id: {{ claim_id }}
status: tentative
confidence: low
created_in: {{ created_in }}
supported_by: []
updated_in: []
opposed_by: []
tags: []
---

# {{ title }}

## Claim

## Supporting evidence

## Uncertainty

## Recommended wording

## Avoid wording
""",
    "context_pack.md.j2": """# Current Task

{{ task }}

## Project Background

{{ project_background }}

## Selected Cycle Summaries

{% for cycle in cycles %}
### {{ cycle.id }} {{ cycle.title }}

{{ cycle.summary }}

{% endfor %}
## Selected Claims

{% for claim in claims %}
### {{ claim.id }} (status: {{ claim.status }}, confidence: {{ claim.confidence }})

{{ claim.body }}

{% endfor %}
## Selected Data Assets

{% for asset in assets %}
- `{{ asset.id }}` | type: `{{ asset.type }}` | format: `{{ asset.format }}` | path: `{{ asset.path }}`
  {{ asset.description }}
{% endfor %}

## Known Uncertainties

{% for item in uncertainties %}
### {{ item.source }}

{{ item.text }}

{% endfor %}
## Instructions for the Agent

{{ instructions }}

## Expected Output Format

{{ expected_output }}
""",
    "analysis_draft.md.j2": """# Agent Output Draft

## 1. Discussion Summary

## 2. Proposed Cycle Update

## 3. Proposed New Claims

## 4. Proposed Claim Revisions

## 5. Data / Figure Files Used

## 6. Remaining Uncertainties

## 7. Suggested Next Steps

## 8. Files Suggested for Write-Back
""",
    "context_summary.md.j2": """# Injectable Summary

## Core context

## Key findings

## Current interpretation

## Uncertainties

## Use this when

## Do not overclaim
""",
}


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def load_template_sources() -> dict[str, str]:
    template_dir = repo_root() / "templates"
    if not template_dir.exists():
        return FALLBACK_TEMPLATE_FILES

    loaded: dict[str, str] = {}
    for name, fallback in FALLBACK_TEMPLATE_FILES.items():
        template_path = template_dir / name
        loaded[name] = template_path.read_text(encoding="utf-8") if template_path.exists() else fallback
    return loaded


def initialize_vault(target: Path) -> Path:
    target = target.resolve()
    if target.exists():
        if any(target.iterdir()):
            raise ContourError(f"Target directory is not empty: {target}")
    else:
        target.mkdir(parents=True)

    for directory in REQUIRED_ROOT_DIRS + DATA_LIBRARY_DIRS + DRAFT_DIRS:
        (target / directory).mkdir(parents=True, exist_ok=True)

    for relative_path, content in PROJECT_FILES.items():
        write_file(target / relative_path, content)

    for relative_path, content in INDEX_FILES.items():
        write_file(target / relative_path, content)

    for filename, content in load_template_sources().items():
        write_file(target / "templates" / filename, content)

    for keep_path in [
        "cycles/.gitkeep",
        "claims/.gitkeep",
        "context_packs/.gitkeep",
        "data_library/raw/.gitkeep",
        "data_library/processed/.gitkeep",
        "data_library/plots/.gitkeep",
        "data_library/scripts/.gitkeep",
        "data_library/models/.gitkeep",
        "drafts/cycle_drafts/.gitkeep",
        "drafts/claim_drafts/.gitkeep",
        "drafts/analysis_drafts/.gitkeep",
        "drafts/context_summary_drafts/.gitkeep",
    ]:
        write_file(target / keep_path, "")

    return target


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
