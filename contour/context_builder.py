from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from jinja2 import Template

from contour.models import LoadedClaim, LoadedCycle, LoadedAsset
from contour.validators import inspect_vault
from contour.vault import ContourError


DEFAULT_AGENT_INSTRUCTIONS = """- Use only the provided context, and say explicitly when evidence is insufficient.
- Preserve uncertainty and avoid overclaiming.
- Treat this output as a draft for human review, not as a final record.
- Reference the cycle, claim, and asset IDs you relied on when you make a judgment."""

DEFAULT_EXPECTED_OUTPUT = """# Agent Output Draft

## 1. Discussion Summary

## 2. Proposed Cycle Update

## 3. Proposed New Claims

## 4. Proposed Claim Revisions

## 5. Data / Figure Files Used

## 6. Remaining Uncertainties

## 7. Suggested Next Steps

## 8. Files Suggested for Write-Back
"""

DEFAULT_CONTEXT_TEMPLATE = """# Current Task

{{ task }}

## Project Background

{{ project_background }}

## Selected Cycle Summaries

{% for cycle in cycles %}
### {{ cycle.id }} {{ cycle.title }}

{{ cycle.summary }}

{% endfor %}
## Selected Claims

{% if claims %}
{% for claim in claims %}
### {{ claim.id }} (status: {{ claim.status }}, confidence: {{ claim.confidence }})

{{ claim.body }}

{% endfor %}
{% else %}
No claims were selected.

{% endif %}
## Selected Data Assets

{% if assets %}
{% for asset in assets %}
- `{{ asset.id }}` | type: `{{ asset.type }}` | format: `{{ asset.format }}` | path: `{{ asset.path }}`
  {{ asset.description }}
  AI access: readable={{ asset.ai_access.readable }}, analyzable={{ asset.ai_access.analyzable }}, editable={{ asset.ai_access.editable }}
{% endfor %}
{% else %}
No data assets were selected.

{% endif %}
## Known Uncertainties

{% if uncertainties %}
{% for item in uncertainties %}
### {{ item.source }}

{{ item.text }}

{% endfor %}
{% else %}
No explicit uncertainty sections were found in the selected materials.

{% endif %}
## Instructions for the Agent

{{ instructions }}

## Expected Output Format

```markdown
{{ expected_output }}
```
"""


def build_context_pack(
    vault_path: Path,
    task: str,
    cycle_ids: list[str],
    claim_ids: list[str],
    asset_ids: list[str],
) -> Path:
    snapshot, report = inspect_vault(vault_path)
    if report.has_errors:
        raise ContourError("Vault validation failed. Run `contour validate` and fix the reported errors before building a context pack.")

    cycles = resolve_selected_cycles(snapshot.cycles, cycle_ids)
    claims = resolve_selected_claims(snapshot.claims, claim_ids)
    assets = resolve_selected_assets(snapshot.assets, asset_ids)

    uncertainties = collect_uncertainties(cycles, claims)
    template = Template(load_context_template(snapshot.root), trim_blocks=True, lstrip_blocks=True)
    rendered = template.render(
        task=task,
        project_background=snapshot.project_background or "No project brief available.",
        cycles=[
            {"id": cycle.metadata.cycle_id, "title": cycle.metadata.title, "summary": cycle.context_summary}
            for cycle in cycles
        ],
        claims=[
            {
                "id": claim.metadata.claim_id,
                "status": claim.metadata.status,
                "confidence": claim.metadata.confidence,
                "body": claim.body,
            }
            for claim in claims
        ],
        assets=[
            {
                "id": asset.record.id,
                "type": asset.record.type,
                "format": asset.record.format,
                "path": asset.record.path,
                "description": asset.record.description,
                "ai_access": asset.record.ai_access,
            }
            for asset in assets
        ],
        uncertainties=uncertainties,
        instructions=DEFAULT_AGENT_INSTRUCTIONS,
        expected_output=DEFAULT_EXPECTED_OUTPUT.strip(),
    ).strip() + "\n"

    context_packs_dir = snapshot.root / "context_packs"
    context_packs_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{datetime.now().date().isoformat()}_{slugify(task)}.md"
    output_path = context_packs_dir / filename
    output_path.write_text(rendered, encoding="utf-8")
    return output_path


def resolve_selected_cycles(cycles: dict[str, LoadedCycle], ids: list[str]) -> list[LoadedCycle]:
    missing = [cycle_id for cycle_id in ids if cycle_id not in cycles]
    if missing:
        raise ContourError(f"Selected cycles do not exist: {', '.join(missing)}")
    return [cycles[cycle_id] for cycle_id in ids]


def resolve_selected_claims(claims: dict[str, LoadedClaim], ids: list[str]) -> list[LoadedClaim]:
    missing = [claim_id for claim_id in ids if claim_id not in claims]
    if missing:
        raise ContourError(f"Selected claims do not exist: {', '.join(missing)}")
    return [claims[claim_id] for claim_id in ids]


def resolve_selected_assets(assets: dict[str, LoadedAsset], ids: list[str]) -> list[LoadedAsset]:
    missing = [asset_id for asset_id in ids if asset_id not in assets]
    if missing:
        raise ContourError(f"Selected assets do not exist: {', '.join(missing)}")
    return [assets[asset_id] for asset_id in ids]


def collect_uncertainties(cycles: list[LoadedCycle], claims: list[LoadedClaim]) -> list[dict[str, str]]:
    collected: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for cycle in cycles:
        for section_name in ("uncertainties", "do not overclaim"):
            section = extract_markdown_section(cycle.context_summary, section_name)
            if section:
                source = f"{cycle.metadata.cycle_id} {section_name.title()}"
                key = (source, section)
                if key not in seen:
                    seen.add(key)
                    collected.append({"source": source, "text": section})

    for claim in claims:
        for section_name in ("uncertainty", "avoid wording"):
            section = extract_markdown_section(claim.body, section_name)
            if section:
                source = f"{claim.metadata.claim_id} {section_name.title()}"
                key = (source, section)
                if key not in seen:
                    seen.add(key)
                    collected.append({"source": source, "text": section})

    return collected


def extract_markdown_section(markdown: str, target_heading: str) -> str:
    target = target_heading.strip().lower()
    current_heading: str | None = None
    current_level = 0
    buffer: list[str] = []

    for line in markdown.splitlines():
        match = re.match(r"^(#{1,6})\s+(.*)$", line.strip())
        if match:
            heading_level = len(match.group(1))
            heading_text = match.group(2).strip().lower()
            if current_heading is not None and heading_level <= current_level:
                break
            if heading_text == target:
                current_heading = heading_text
                current_level = heading_level
                buffer = []
                continue
        if current_heading is not None:
            buffer.append(line)

    return "\n".join(buffer).strip()


def load_context_template(vault_root: Path) -> str:
    template_path = vault_root / "templates" / "context_pack.md.j2"
    if template_path.exists():
        return template_path.read_text(encoding="utf-8")
    return DEFAULT_CONTEXT_TEMPLATE


def slugify(task: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", task.lower()).strip("_")
    return slug or "context_pack"
