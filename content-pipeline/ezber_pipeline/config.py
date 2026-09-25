"""Configuration loading.

All configuration is committed JSON under ``content-pipeline/config``. This
module is the single place that knows the on-disk shape; the rest of the
pipeline consumes plain dicts/objects.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .canonical import load_json
from .errors import ConfigError

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_DIR = REPO_ROOT / "content-pipeline" / "config"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "content-pipeline" / "build"
DEFAULT_CACHE_DIR = REPO_ROOT / "content-pipeline" / ".cache"
LICENSE_REGISTRY_PATH = REPO_ROOT / "licenses" / "registry.json"
CONTENT_SCHEMA_PATH = REPO_ROOT / "schema" / "content_schema.sql"
USER_SCHEMA_PATH = REPO_ROOT / "schema" / "user_schema.sql"


@dataclass(frozen=True)
class SourceConfig:
    id: str
    kind: str
    url: str
    description: str
    license_id: str
    license_url: str
    license_evidence_url: str
    attribution: str
    notice_file: str | None = None


@dataclass(frozen=True)
class PipelineConfig:
    raw: dict[str, Any]
    config_dir: Path
    sources: dict[str, SourceConfig] = field(default_factory=dict)
    reciters: list[dict[str, Any]] = field(default_factory=list)
    catalog_policy: dict[str, Any] = field(default_factory=dict)
    fallback_sources: list[dict[str, Any]] = field(default_factory=list)
    transliteration: dict[str, Any] = field(default_factory=dict)
    word_timing: dict[str, Any] = field(default_factory=dict)
    licenses: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def pipeline(self) -> dict[str, Any]:
        return self.raw["pipeline"]

    @property
    def name(self) -> str:
        return self.pipeline["name"]

    @property
    def version(self) -> str:
        return self.pipeline["version"]

    @property
    def schema_version(self) -> int:
        return int(self.pipeline["schema_version"])

    @property
    def expected_surah_count(self) -> int:
        return int(self.pipeline["expected_surah_count"])

    @property
    def expected_ayah_count(self) -> int:
        return int(self.pipeline["expected_ayah_count"])

    @property
    def user_agent(self) -> str:
        return self.pipeline["user_agent"]

    @property
    def http(self) -> dict[str, Any]:
        return self.pipeline["http"]

    @property
    def policy(self) -> dict[str, Any]:
        return self.raw["policy"]

    @property
    def content_policy(self) -> dict[str, Any]:
        return self.raw.get("content_policy", {})

    def enabled_reciters(self) -> list[dict[str, Any]]:
        return [reciter for reciter in self.reciters if reciter.get("enabled", False)]

    def enabled_timing_recitations(self) -> list[dict[str, Any]]:
        return [
            recitation
            for recitation in self.word_timing.get("recitations", [])
            if recitation.get("status") == "enabled"
        ]


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ConfigError(message)


def load_licenses(path: Path = LICENSE_REGISTRY_PATH) -> dict[str, dict[str, Any]]:
    if not path.exists():
        raise ConfigError(f"license registry not found: {path}")
    data = load_json(str(path))
    _require(data.get("registry_version") == 1, f"unsupported license registry version in {path}")
    licenses = {}
    for entry in data.get("licenses", []):
        license_id = entry.get("id")
        _require(bool(license_id), f"license entry without id in {path}")
        _require(license_id not in licenses, f"duplicate license id {license_id!r} in {path}")
        _require(bool(entry.get("attribution")), f"license {license_id!r} has no attribution template")
        licenses[license_id] = entry
    return licenses


def load_config(config_dir: Path | None = None) -> PipelineConfig:
    config_dir = Path(config_dir) if config_dir else DEFAULT_CONFIG_DIR
    if not config_dir.is_dir():
        raise ConfigError(f"config directory not found: {config_dir}")

    raw = load_json(str(config_dir / "sources.json"))
    _require(raw.get("config_version") == 2, "unsupported sources.json config_version")

    sources: dict[str, SourceConfig] = {}
    for source_id, entry in raw.get("sources", {}).items():
        sources[source_id] = SourceConfig(
            id=source_id,
            kind=entry["kind"],
            url=entry["url"],
            description=entry.get("description", ""),
            license_id=entry["license_id"],
            license_url=entry["license_url"],
            license_evidence_url=entry["license_evidence_url"],
            attribution=entry["attribution"],
            notice_file=entry.get("notice_file"),
        )

    reciter_doc = load_json(str(config_dir / "reciters.json"))
    transliteration = load_json(str(config_dir / "transliteration.json"))
    word_timing = load_json(str(config_dir / "word_timing.json"))
    licenses = load_licenses()

    config = PipelineConfig(
        raw=raw,
        config_dir=config_dir,
        sources=sources,
        reciters=reciter_doc.get("reciters", []),
        catalog_policy=reciter_doc.get("catalog_policy", {}),
        fallback_sources=reciter_doc.get("fallback_sources", []),
        transliteration=transliteration,
        word_timing=word_timing,
        licenses=licenses,
    )
    validate_config(config)
    return config


def validate_config(config: PipelineConfig) -> None:
    """Fail fast on configuration that cannot produce a valid bundle."""
    required_sources = {"tanzil_text", "tanzil_metadata"}
    missing = required_sources - set(config.sources)
    _require(not missing, f"missing required sources: {sorted(missing)}")

    known_license_ids = set(config.licenses)
    for source in config.sources.values():
        _require(
            source.license_id in known_license_ids,
            f"source {source.id!r} references unknown license {source.license_id!r}",
        )

    for fallback in config.fallback_sources:
        _require(
            not fallback.get("enabled", False),
            f"fallback source {fallback.get('id')!r} must stay disabled until its rights are cleared",
        )

    for reciter in config.reciters:
        _require(bool(reciter.get("remote_id")), "reciter without remote_id")
        _require(isinstance(reciter.get("enabled"), bool), f"reciter {reciter['remote_id']!r} needs an explicit enabled flag")
        for field_name in config.policy["reciter_required_fields"]:
            _require(
                bool(reciter.get(field_name)),
                f"reciter {reciter.get('remote_id')!r} missing required field {field_name!r}",
            )
        _require(
            reciter["license_id"] in known_license_ids,
            f"reciter {reciter['remote_id']!r} references unknown license {reciter['license_id']!r}",
        )
        _require(bool(reciter.get("styles")), f"reciter {reciter['remote_id']!r} has no styles")
        style_ids = [style["id"] for style in reciter["styles"]]
        _require(len(style_ids) == len(set(style_ids)), f"reciter {reciter['remote_id']!r} has duplicate style ids")
        _require(
            reciter.get("default_style") in style_ids,
            f"reciter {reciter['remote_id']!r} default_style not in styles",
        )
        for style in reciter["styles"]:
            _require(
                bool(style.get("bitrates")),
                f"reciter {reciter['remote_id']!r} style {style['id']!r} has no bitrates",
            )
            if style["id"] == reciter.get("default_style"):
                _require(
                    reciter.get("default_bitrate") in style.get("bitrates", []),
                    f"reciter {reciter['remote_id']!r} default_bitrate not in style {style['id']!r} bitrates",
                )

    _require(config.transliteration.get("config_version") == 1, "unsupported transliteration.json config_version")
    edition = config.transliteration.get("edition", {})
    for field_name in (
        "resource_id",
        "name",
        "language",
        "url",
        "license_id",
        "license_url",
        "license_evidence_url",
        "attribution",
    ):
        _require(bool(edition.get(field_name)), f"transliteration edition missing {field_name!r}")
    _require(
        edition.get("license_id") in known_license_ids,
        f"transliteration edition references unknown license {edition.get('license_id')!r}",
    )

    word_timing = config.word_timing
    _require(word_timing.get("config_version") == 1, "unsupported word_timing.json config_version")
    recitations = word_timing.get("recitations", [])
    enabled = [recitation for recitation in recitations if recitation.get("status") == "enabled"]
    if word_timing.get("enabled", False):
        _require(bool(enabled), "word_timing.enabled is true but no recitation has status 'enabled'")
        for field_name in ("source", "archive_url", "license_id", "license_url", "license_evidence_url", "attribution"):
            _require(bool(word_timing.get(field_name)), f"word_timing missing {field_name!r}")
        _require(
            word_timing["license_id"] in known_license_ids,
            f"word_timing references unknown license {word_timing['license_id']!r}",
        )
        for recitation in recitations:
            for field_name in ("asset", "remote_id", "name", "style_id", "style", "status"):
                _require(
                    bool(recitation.get(field_name)),
                    f"word_timing recitation {recitation.get('asset', '?')!r} missing {field_name!r}",
                )
            _require(
                recitation["status"] in ("enabled", "excluded"),
                f"word_timing recitation {recitation['remote_id']!r} has unknown status",
            )
            if recitation["status"] == "excluded":
                _require(
                    bool(recitation.get("excluded_reason")),
                    f"excluded recitation {recitation['remote_id']!r} needs excluded_reason",
                )
