from __future__ import annotations

from pathlib import Path

import frontmatter
import yaml
from pydantic import ValidationError

from contour.models import (
    AssetRecord,
    ClaimMetadata,
    CycleMetadata,
    LoadedAsset,
    LoadedClaim,
    LoadedCycle,
    ValidationReport,
    VaultSnapshot,
)
from contour.vault import OPTIONAL_PROJECT_FILES, REQUIRED_ROOT_DIRS


def inspect_vault(vault_path: Path) -> tuple[VaultSnapshot, ValidationReport]:
    root = vault_path.resolve()
    snapshot = VaultSnapshot(root=root)
    report = ValidationReport()

    if not root.exists():
        report.add_error(str(root), "Vault path does not exist.")
        return snapshot, report

    for relative_dir in REQUIRED_ROOT_DIRS:
        directory = root / relative_dir
        if not directory.exists() or not directory.is_dir():
            report.add_error(relative_dir, "Required directory is missing.")

    project_brief_path = root / "project" / "project_brief.md"
    if project_brief_path.exists():
        snapshot.project_brief_path = project_brief_path
        snapshot.project_background = project_brief_path.read_text(encoding="utf-8").strip()
    else:
        report.add_error("project/project_brief.md", "Required project brief file is missing.")

    for relative_file in OPTIONAL_PROJECT_FILES:
        if not (root / relative_file).exists():
            report.add_warning(relative_file, "Optional project file is missing.")

    load_claims(snapshot, report)
    load_cycles(snapshot, report)
    validate_cross_references(snapshot, report)
    return snapshot, report


def load_claims(snapshot: VaultSnapshot, report: ValidationReport) -> None:
    claims_dir = snapshot.root / "claims"
    if not claims_dir.exists():
        return

    for claim_path in sorted(claims_dir.glob("*.md")):
        post = parse_frontmatter_file(claim_path, report)
        if post is None:
            continue

        try:
            metadata = ClaimMetadata.model_validate(post.metadata)
        except ValidationError as exc:
            report.add_error(rel(snapshot.root, claim_path), compact_validation_error(exc))
            continue

        claim_id = metadata.claim_id
        if claim_id in snapshot.claims:
            report.add_error(rel(snapshot.root, claim_path), f"Duplicate claim_id '{claim_id}'.")
            continue

        snapshot.claims[claim_id] = LoadedClaim(
            path=claim_path,
            metadata=metadata,
            body=post.content.strip(),
        )


def load_cycles(snapshot: VaultSnapshot, report: ValidationReport) -> None:
    cycles_dir = snapshot.root / "cycles"
    if not cycles_dir.exists():
        return

    for cycle_dir in sorted(path for path in cycles_dir.iterdir() if path.is_dir() and not path.name.startswith(".")):
        cycle_file = cycle_dir / "cycle.md"
        context_summary_file = cycle_dir / "context_summary.md"
        assets_file = cycle_dir / "assets.yaml"

        missing = [name for name, path in {
            "cycle.md": cycle_file,
            "context_summary.md": context_summary_file,
            "assets.yaml": assets_file,
        }.items() if not path.exists()]

        if missing:
            report.add_error(rel(snapshot.root, cycle_dir), f"Missing required cycle files: {', '.join(missing)}.")
            continue

        post = parse_frontmatter_file(cycle_file, report)
        if post is None:
            continue

        try:
            metadata = CycleMetadata.model_validate(post.metadata)
        except ValidationError as exc:
            report.add_error(rel(snapshot.root, cycle_file), compact_validation_error(exc))
            continue

        cycle_id = metadata.cycle_id
        if cycle_id in snapshot.cycles:
            report.add_error(rel(snapshot.root, cycle_file), f"Duplicate cycle_id '{cycle_id}'.")
            continue

        assets = load_assets_file(snapshot, report, cycle_dir, assets_file, cycle_id)
        snapshot.cycles[cycle_id] = LoadedCycle(
            directory=cycle_dir,
            cycle_file=cycle_file,
            context_summary_file=context_summary_file,
            assets_file=assets_file,
            metadata=metadata,
            body=post.content.strip(),
            context_summary=context_summary_file.read_text(encoding="utf-8").strip(),
            assets=assets,
        )


def load_assets_file(
    snapshot: VaultSnapshot,
    report: ValidationReport,
    cycle_dir: Path,
    assets_file: Path,
    cycle_id: str,
) -> dict[str, LoadedAsset]:
    loaded_assets: dict[str, LoadedAsset] = {}

    try:
        raw = yaml.safe_load(assets_file.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        report.add_error(rel(snapshot.root, assets_file), f"YAML parsing failed: {exc}")
        return loaded_assets

    assets = raw.get("assets")
    if not isinstance(assets, list):
        report.add_error(rel(snapshot.root, assets_file), "assets.yaml must contain an 'assets' list.")
        return loaded_assets

    for index, item in enumerate(assets, start=1):
        location = f"{rel(snapshot.root, assets_file)}#{index}"
        try:
            record = AssetRecord.model_validate(item)
        except ValidationError as exc:
            report.add_error(location, compact_validation_error(exc))
            continue

        asset_path = Path(record.path)
        if asset_path.is_absolute():
            report.add_error(location, f"Asset path must be relative, got '{record.path}'.")
            continue

        resolved_path = (cycle_dir / asset_path).resolve()
        if not resolved_path.exists():
            report.add_error(location, f"Referenced asset path does not exist: {record.path}")
            continue

        if record.id in loaded_assets:
            report.add_error(location, f"Duplicate asset id '{record.id}' inside cycle {cycle_id}.")
            continue

        if record.id in snapshot.assets:
            report.add_error(location, f"Duplicate global asset id '{record.id}'.")
            continue

        loaded_asset = LoadedAsset(
            cycle_id=cycle_id,
            source_file=assets_file,
            resolved_path=resolved_path,
            record=record,
        )
        loaded_assets[record.id] = loaded_asset
        snapshot.assets[record.id] = loaded_asset

    return loaded_assets


def validate_cross_references(snapshot: VaultSnapshot, report: ValidationReport) -> None:
    for cycle_id, cycle in snapshot.cycles.items():
        for claim_id in cycle.metadata.related_claims:
            if claim_id not in snapshot.claims:
                report.add_error(
                    rel(snapshot.root, cycle.cycle_file),
                    f"related_claims references missing claim '{claim_id}'.",
                )

        for asset_id in cycle.metadata.related_assets:
            if asset_id not in cycle.assets:
                report.add_error(
                    rel(snapshot.root, cycle.cycle_file),
                    f"related_assets references missing cycle asset '{asset_id}'.",
                )


def parse_frontmatter_file(path: Path, report: ValidationReport):
    try:
        return frontmatter.load(path)
    except Exception as exc:  # noqa: BLE001
        report.add_error(rel(path.parent.parent if path.parent.parent.exists() else path.parent, path), f"Frontmatter parsing failed: {exc}")
        return None


def compact_validation_error(exc: ValidationError) -> str:
    parts: list[str] = []
    for issue in exc.errors():
        location = ".".join(str(part) for part in issue["loc"])
        parts.append(f"{location}: {issue['msg']}")
    return "; ".join(parts)


def rel(root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path)
