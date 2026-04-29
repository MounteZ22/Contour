from __future__ import annotations

from pathlib import Path

import typer
from rich.console import Console

from contour.context_builder import build_context_pack
from contour.models import ValidationReport
from contour.validators import inspect_vault
from contour.vault import ContourError, initialize_vault

app = typer.Typer(help="Contour V0.1 CLI")
console = Console(width=160)


@app.command()
def init(path: Path) -> None:
    """Create a new Contour vault skeleton."""
    try:
        initialized_path = initialize_vault(path)
    except ContourError as exc:
        console.print(f"[red]Error:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    console.print(f"[green]Initialized vault:[/green] {initialized_path}")


@app.command()
def validate(vault_path: Path) -> None:
    """Validate a Contour vault."""
    snapshot, report = inspect_vault(vault_path)
    render_validation_report(snapshot.root, report)

    if report.has_errors:
        raise typer.Exit(code=1)


@app.command(
    "build-context",
    context_settings={"allow_extra_args": True, "ignore_unknown_options": True},
)
def build_context(
    ctx: typer.Context,
    vault: Path = typer.Option(..., help="Path to the Contour vault."),
    task: str = typer.Option(..., help="Task description for this collaboration."),
) -> None:
    """Generate a task-specific Markdown context pack."""
    selections = parse_selection_args(ctx.args)

    try:
        output_path = build_context_pack(
            vault_path=vault,
            task=task,
            cycle_ids=selections["cycles"],
            claim_ids=selections["claims"],
            asset_ids=selections["assets"],
        )
    except ContourError as exc:
        console.print(f"[red]Error:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    console.print(f"[green]Context pack written:[/green] {output_path}")


def parse_selection_args(args: list[str]) -> dict[str, list[str]]:
    allowed = {"--cycles": "cycles", "--claims": "claims", "--assets": "assets"}
    parsed = {"cycles": [], "claims": [], "assets": []}
    current_key: str | None = None

    for token in args:
        if token in allowed:
            current_key = allowed[token]
            continue

        if token.startswith("--"):
            raise ContourError(f"Unknown option for build-context: {token}")

        if current_key is None:
            raise ContourError(
                "Selection values must follow one of --cycles, --claims, or --assets."
            )

        parsed[current_key].append(token)

    if not parsed["cycles"]:
        raise ContourError("At least one cycle ID is required. Use --cycles C001 C002 ...")

    return parsed


def render_validation_report(vault_root: Path, report: ValidationReport) -> None:
    console.print(f"[bold]Validation target:[/bold] {vault_root}")

    if report.errors:
        console.print("[red]Errors[/red]")
        for message in report.errors:
            console.print(f"  - {message.location}: {message.message}")
    else:
        console.print("[green]Errors[/green]")
        console.print("  - None")

    if report.warnings:
        console.print("[yellow]Warnings[/yellow]")
        for message in report.warnings:
            console.print(f"  - {message.location}: {message.message}")
    else:
        console.print("[green]Warnings[/green]")
        console.print("  - None")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
