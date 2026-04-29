from __future__ import annotations

import shutil
from pathlib import Path

from typer.testing import CliRunner

from contour.cli import app

runner = CliRunner()
REPO_ROOT = Path(__file__).resolve().parents[1]
EXAMPLE_VAULT = REPO_ROOT / "example_vault"


def test_init_creates_skeleton(tmp_path: Path) -> None:
    target = tmp_path / "demo-vault"
    result = runner.invoke(app, ["init", str(target)])

    assert result.exit_code == 0, result.stdout
    assert (target / "project" / "project_brief.md").exists()
    assert (target / "drafts" / "cycle_drafts").exists()
    assert (target / "templates" / "context_pack.md.j2").exists()
    assert (target / "indexes" / "asset_index.yaml").exists()


def test_validate_example_vault_success() -> None:
    result = runner.invoke(app, ["validate", str(EXAMPLE_VAULT)])

    assert result.exit_code == 0, result.stdout
    assert "Errors" in result.stdout
    assert "None" in result.stdout


def test_validate_reports_missing_asset_file(tmp_path: Path) -> None:
    vault = copy_example_vault(tmp_path)
    asset_file = vault / "cycles" / "C002_flux_decline_analysis" / "data" / "processed" / "fgdw_flux_summary.csv"
    asset_file.unlink()

    result = runner.invoke(app, ["validate", str(vault)])

    assert result.exit_code != 0
    assert "Referenced asset path does not exist" in result.stdout


def test_validate_reports_missing_frontmatter_field(tmp_path: Path) -> None:
    vault = copy_example_vault(tmp_path)
    cycle_file = vault / "cycles" / "C001_problem_framing" / "cycle.md"
    text = cycle_file.read_text(encoding="utf-8")
    cycle_file.write_text(text.replace("stage: literature_review\n", ""), encoding="utf-8")

    result = runner.invoke(app, ["validate", str(vault)])

    assert result.exit_code != 0
    assert "stage: Field required" in result.stdout


def test_validate_reports_absolute_asset_path(tmp_path: Path) -> None:
    vault = copy_example_vault(tmp_path)
    assets_file = vault / "cycles" / "C001_problem_framing" / "assets.yaml"
    text = assets_file.read_text(encoding="utf-8")
    assets_file.write_text(text.replace("data/processed/framing_notes.csv", "C:/temp/framing_notes.csv"), encoding="utf-8")

    result = runner.invoke(app, ["validate", str(vault)])

    assert result.exit_code != 0
    assert "Asset path must be relative" in result.stdout


def test_validate_reports_missing_related_claim(tmp_path: Path) -> None:
    vault = copy_example_vault(tmp_path)
    claim_file = vault / "claims" / "CLM_001.md"
    claim_file.unlink()

    result = runner.invoke(app, ["validate", str(vault)])

    assert result.exit_code != 0
    assert "missing claim 'CLM_001'" in result.stdout


def test_validate_reports_duplicate_asset_id(tmp_path: Path) -> None:
    vault = copy_example_vault(tmp_path)
    second_assets = vault / "cycles" / "C002_flux_decline_analysis" / "assets.yaml"
    text = second_assets.read_text(encoding="utf-8")
    second_assets.write_text(text.replace("DA_002", "DA_001"), encoding="utf-8")

    result = runner.invoke(app, ["validate", str(vault)])

    assert result.exit_code != 0
    assert "Duplicate global asset id 'DA_001'" in result.stdout


def test_build_context_generates_markdown_pack(tmp_path: Path) -> None:
    vault = copy_example_vault(tmp_path)

    result = runner.invoke(
        app,
        [
            "build-context",
            "--vault",
            str(vault),
            "--task",
            "Discuss the interpretation of PA-PVDF flux decline in FGDW",
            "--cycles",
            "C001",
            "C002",
            "--claims",
            "CLM_001",
            "--assets",
            "DA_001",
            "DA_002",
        ],
    )

    assert result.exit_code == 0, result.stdout
    generated = next((vault / "context_packs").glob("*.md"))
    content = generated.read_text(encoding="utf-8")
    assert "# Current Task" in content
    assert "## Selected Cycle Summaries" in content
    assert "## Known Uncertainties" in content
    assert "CLM_001" in content
    assert "DA_002" in content


def copy_example_vault(tmp_path: Path) -> Path:
    target = tmp_path / "example_vault_copy"
    shutil.copytree(EXAMPLE_VAULT, target)
    return target
