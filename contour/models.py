from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class AIAccess(BaseModel):
    model_config = ConfigDict(extra="ignore")

    readable: bool
    analyzable: bool
    editable: bool


class AssetRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    type: str
    format: str
    path: str
    description: str
    ai_access: AIAccess
    role: str | None = None
    generated_in: str | None = None
    used_for: list[str] = Field(default_factory=list)
    source_data: list[str] = Field(default_factory=list)
    generated_by: str | None = None


class CycleMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    cycle_id: str
    title: str
    status: str
    created: date
    updated: date
    stage: str
    related_claims: list[str]
    related_assets: list[str]
    parent_cycles: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class ClaimMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    claim_id: str
    status: str
    confidence: str
    created_in: str
    supported_by: list[str]
    updated_in: list[str] = Field(default_factory=list)
    opposed_by: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


@dataclass(slots=True)
class ValidationMessage:
    location: str
    message: str


@dataclass(slots=True)
class ValidationReport:
    errors: list[ValidationMessage] = field(default_factory=list)
    warnings: list[ValidationMessage] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return bool(self.errors)

    def add_error(self, location: str, message: str) -> None:
        self.errors.append(ValidationMessage(location=location, message=message))

    def add_warning(self, location: str, message: str) -> None:
        self.warnings.append(ValidationMessage(location=location, message=message))


@dataclass(slots=True)
class LoadedAsset:
    cycle_id: str
    source_file: Path
    resolved_path: Path
    record: AssetRecord


@dataclass(slots=True)
class LoadedCycle:
    directory: Path
    cycle_file: Path
    context_summary_file: Path
    assets_file: Path
    metadata: CycleMetadata
    body: str
    context_summary: str
    assets: dict[str, LoadedAsset]


@dataclass(slots=True)
class LoadedClaim:
    path: Path
    metadata: ClaimMetadata
    body: str


@dataclass(slots=True)
class VaultSnapshot:
    root: Path
    project_brief_path: Path | None = None
    project_background: str = ""
    cycles: dict[str, LoadedCycle] = field(default_factory=dict)
    claims: dict[str, LoadedClaim] = field(default_factory=dict)
    assets: dict[str, LoadedAsset] = field(default_factory=dict)
