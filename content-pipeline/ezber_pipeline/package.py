"""Packaging: SQLite bundle plus machine-readable manifests and credits."""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import __version__
from .bundle import Bundle
from .canonical import canonical_json_bytes, digest_json, sha256_digest
from .config import PipelineConfig
from .validate import CheckResult

DATA_TABLES = [
    "surahs",
    "ayahs",
    "words",
    "reciters",
    "audio_files",
    "segments",
    "translations",
    "translation_rows",
    "transliterations",
    "transliteration_rows",
]

# Explicit ordering keys keep logical digests stable for WITHOUT ROWID tables.
TABLE_ORDER = {
    "surahs": "id",
    "ayahs": "id",
    "words": "id",
    "reciters": "id",
    "audio_files": "id",
    "segments": "reciter_id, variant, ayah_id, word_index",
    "translations": "id",
    "translation_rows": "translation_id, ayah_id",
    "transliterations": "id",
    "transliteration_rows": "transliteration_id, ayah_id",
}


@dataclass
class PackageResult:
    output_dir: Path
    database_path: Path
    database_sha256: str
    database_bytes: int
    logical_digest: str
    artifacts: dict[str, Path] = field(default_factory=dict)
    manifest: dict[str, Any] = field(default_factory=dict)


def _insert(conn: sqlite3.Connection, sql: str, rows: list[tuple]) -> None:
    conn.executemany(sql, rows)


def create_database(bundle: Bundle, schema_path: Path, target: Path) -> tuple[str, int, str]:
    """Build the content DB deterministically; return (sha256, bytes, logical digest)."""
    for suffix in ("", "-journal", "-wal", "-shm"):
        stale = Path(str(target) + suffix)
        if stale.exists():
            stale.unlink()

    conn = sqlite3.connect(str(target))
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA page_size = 4096")
        schema_sql = schema_path.read_text(encoding="utf-8")
        conn.executescript(schema_sql)

        _insert(
            conn,
            "INSERT INTO surahs (id, name_arabic, name_latin, name_english, verses_count, "
            "revelation, bismillah_pre, revelation_order, rukus) VALUES (?,?,?,?,?,?,?,?,?)",
            [
                (
                    surah.id,
                    surah.name_arabic,
                    surah.name_latin,
                    surah.name_english,
                    surah.verses_count,
                    surah.revelation,
                    surah.bismillah_pre,
                    surah.revelation_order,
                    surah.rukus,
                )
                for surah in bundle.surahs
            ],
        )
        _insert(
            conn,
            "INSERT INTO ayahs (id, surah_id, ayah, verse_key, text_uthmani, juz, hizb, page, "
            "sajdah, sajdah_type) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    ayah.id,
                    ayah.surah_id,
                    ayah.ayah,
                    ayah.verse_key,
                    ayah.text_uthmani,
                    ayah.juz,
                    ayah.hizb,
                    ayah.page,
                    ayah.sajdah,
                    ayah.sajdah_type,
                )
                for ayah in bundle.ayahs
            ],
        )
        _insert(
            conn,
            "INSERT INTO words (id, ayah_id, position, text_uthmani, transliteration, translation) "
            "VALUES (?,?,?,?,?,?)",
            [
                (
                    word.id,
                    word.ayah_id,
                    word.position,
                    word.text_uthmani,
                    word.transliteration,
                    word.translation,
                )
                for word in bundle.words
            ],
        )
        _insert(
            conn,
            "INSERT INTO reciters (id, remote_id, name, style, qirat, source, license_id, "
            "license_url, license_evidence_url, attribution, has_segments, enabled) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    reciter.id,
                    reciter.remote_id,
                    reciter.name,
                    reciter.style,
                    reciter.qirat,
                    reciter.source,
                    reciter.license_id,
                    reciter.license_url,
                    reciter.license_evidence_url,
                    reciter.attribution,
                    reciter.has_segments,
                    reciter.enabled,
                )
                for reciter in bundle.reciters
            ],
        )
        _insert(
            conn,
            "INSERT INTO audio_files (reciter_id, kind, surah_id, ayah, chapter, variant, url, "
            "local_path, bytes, bitrate, duration_ms, checksum, downloaded_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    audio.reciter_id,
                    audio.kind,
                    audio.surah_id,
                    audio.ayah,
                    audio.chapter,
                    audio.variant,
                    audio.url,
                    audio.local_path,
                    audio.bytes,
                    audio.bitrate,
                    audio.duration_ms,
                    audio.checksum,
                    audio.downloaded_at,
                )
                for audio in bundle.audio_files
            ],
        )
        _insert(
            conn,
            "INSERT INTO segments (reciter_id, variant, ayah_id, word_index, start_ms, end_ms) "
            "VALUES (?,?,?,?,?,?)",
            [
                (
                    segment.reciter_id,
                    segment.variant,
                    segment.ayah_id,
                    segment.word_index,
                    segment.start_ms,
                    segment.end_ms,
                )
                for segment in bundle.segments
            ],
        )
        _insert(
            conn,
            "INSERT INTO translations (id, resource_id, name, author, language, source, "
            "license_id, license_url, license_evidence_url, attribution) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    edition.id,
                    edition.resource_id,
                    edition.name,
                    edition.author,
                    edition.language,
                    edition.source,
                    edition.license_id,
                    edition.license_url,
                    edition.license_evidence_url,
                    edition.attribution,
                )
                for edition in bundle.translations
            ],
        )
        _insert(
            conn,
            "INSERT INTO translation_rows (translation_id, ayah_id, text) VALUES (?,?,?)",
            [(row.edition_id, row.ayah_id, row.text) for row in bundle.translation_rows],
        )
        _insert(
            conn,
            "INSERT INTO transliterations (id, resource_id, name, author, language, source, "
            "license_id, license_url, license_evidence_url, attribution) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    edition.id,
                    edition.resource_id,
                    edition.name,
                    edition.author,
                    edition.language,
                    edition.source,
                    edition.license_id,
                    edition.license_url,
                    edition.license_evidence_url,
                    edition.attribution,
                )
                for edition in bundle.transliterations
            ],
        )
        _insert(
            conn,
            "INSERT INTO transliteration_rows (transliteration_id, ayah_id, text) VALUES (?,?,?)",
            [(row.edition_id, row.ayah_id, row.text) for row in bundle.transliteration_rows],
        )

        digest = _logical_digest(conn)
        _insert(
            conn,
            "INSERT INTO content_meta (key, value) VALUES (?,?)",
            [
                ("schema_version", "1"),
                ("pipeline_name", "ezber-content-pipeline"),
                ("pipeline_version", __version__),
                ("content_mode", bundle.content_mode),
                ("logical_digest", digest),
                ("transliteration_resource_ids", ",".join(e.resource_id for e in bundle.transliterations)),
                ("reciter_count", str(len(bundle.reciters))),
                ("word_count", str(len(bundle.words))),
                ("audio_file_count", str(len(bundle.audio_files))),
                ("segment_count", str(len(bundle.segments))),
            ],
        )
        conn.commit()
        conn.execute("VACUUM")
    finally:
        conn.close()

    data = target.read_bytes()
    return sha256_digest(data), len(data), digest


def _logical_digest(conn: sqlite3.Connection) -> str:
    parts: list[Any] = []
    for table in DATA_TABLES:
        rows = conn.execute(f"SELECT * FROM {table} ORDER BY {TABLE_ORDER[table]}").fetchall()
        parts.append([table, [list(row) for row in rows]])
    return digest_json(parts)


def _asset_document(asset) -> dict[str, Any]:
    return {
        "asset_id": asset.asset_id,
        "kind": asset.kind,
        "description": asset.description,
        "source": {
            "name": asset.source_name,
            "url": asset.source_url,
            "version": asset.version,
            "sha256": asset.sha256,
            "digest": asset.digest,
            "bytes": asset.bytes,
        },
        "license": {
            "id": asset.license_id,
            "url": asset.license_url,
            "evidence_url": asset.license_evidence_url,
            "attribution": asset.attribution,
        },
        "details": asset.details,
    }


def build_content_manifest(
    bundle: Bundle,
    config: PipelineConfig,
    database_info: dict[str, Any],
) -> dict[str, Any]:
    licenses = {
        license_id: {
            "spdx": entry.get("spdx"),
            "name": entry.get("name"),
            "url": entry.get("url"),
            "redistribution": entry.get("redistribution"),
            "commercial_use": entry.get("commercial_use"),
            "attribution_required": entry.get("attribution_required"),
            "notice_required": entry.get("notice_required"),
            "obligations": entry.get("obligations", []),
        }
        for license_id, entry in sorted(config.licenses.items())
        if license_id in {asset.license_id for asset in bundle.assets}
    }
    attributions: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for asset in sorted(bundle.assets, key=lambda item: item.asset_id):
        key = (asset.license_id, asset.attribution)
        if key in seen:
            continue
        seen.add(key)
        attributions.append(
            {
                "license_id": asset.license_id,
                "text": asset.attribution,
                "example_asset_id": asset.asset_id,
            }
        )

    return {
        "manifest_version": 1,
        "generated_by": {
            "name": config.name,
            "version": config.version,
            "pipeline_version": __version__,
            "schema_version": config.schema_version,
        },
        "bundle": {
            "surahs": len(bundle.surahs),
            "ayahs": len(bundle.ayahs),
            "words": len(bundle.words),
            "reciters": len(bundle.reciters),
            "audio_files": len(bundle.audio_files),
            "segments": len(bundle.segments),
            "translations": [
                {"resource_id": edition.resource_id, "name": edition.name, "language": edition.language}
                for edition in sorted(bundle.translations, key=lambda item: item.id)
            ],
            "transliterations": [
                {"resource_id": edition.resource_id, "name": edition.name, "language": edition.language}
                for edition in sorted(bundle.transliterations, key=lambda item: item.id)
            ],
            "database": database_info,
        },
        "content_policy": {
            "mode": config.content_policy.get("mode"),
            "description": config.content_policy.get("description"),
            "translations_enabled": config.content_policy.get("translations_enabled"),
            "quran_foundation_enabled": config.content_policy.get("quran_foundation_enabled"),
        },
        "distribution_policy": {
            "deny_hosts": config.policy.get("deny_hosts", []),
            "deny_url_substrings": config.policy.get("deny_url_substrings", []),
            "deny_reason": config.policy.get("deny_reason", ""),
        },
        "licenses": licenses,
        "assets": [_asset_document(asset) for asset in sorted(bundle.assets, key=lambda item: item.asset_id)],
        "attributions": attributions,
    }


def build_audio_manifest(bundle: Bundle, config: PipelineConfig) -> dict[str, Any]:
    audio_by_group: dict[tuple[int, str, int], list] = {}
    for audio in bundle.audio_files:
        audio_by_group.setdefault((audio.reciter_id, audio.variant, audio.bitrate or 0), []).append(audio)

    segment_counts: dict[int, dict[str, int]] = {}
    for segment in bundle.segments:
        bucket = segment_counts.setdefault(segment.reciter_id, {"whole_ayah": 0, "word": 0})
        bucket["whole_ayah" if segment.word_index == 0 else "word"] += 1

    reciters: list[dict[str, Any]] = []
    audio_reciters = [reciter for reciter in bundle.reciters if reciter.source != "quran_align"]
    timing_reciters = [reciter for reciter in bundle.reciters if reciter.source == "quran_align"]
    reciter_configs = {entry["remote_id"]: entry for entry in config.enabled_reciters()}
    for reciter in sorted(audio_reciters, key=lambda item: item.id):
        reciter_config = reciter_configs[reciter.remote_id]
        styles: list[dict[str, Any]] = []
        for style in reciter_config["styles"]:
            files = [
                {
                    "kind": audio.kind,
                    "chapter": audio.chapter,
                    "surah_id": audio.surah_id,
                    "bitrate": audio.bitrate,
                    "url": audio.url,
                    "bytes": audio.bytes,
                    "sha1": (audio.checksum or "").split(":", 1)[-1] or None,
                    "duration_ms": audio.duration_ms,
                }
                for bitrate in style["bitrates"]
                for audio in sorted(
                    audio_by_group.get((reciter.id, style["id"], int(bitrate)), []),
                    key=lambda item: item.chapter or 0,
                )
            ]
            timing_asset = next(
                (
                    asset
                    for asset in bundle.assets
                    if asset.asset_id == f"recitation-timing:{reciter.remote_id}:{style['id']}"
                ),
                None,
            )
            styles.append(
                {
                    "id": style["id"],
                    "name": style["name"],
                    "bitrates": style["bitrates"],
                    "timing": {
                        "url": timing_asset.source_url if timing_asset else None,
                        "sha256": timing_asset.sha256 if timing_asset else None,
                        "rows": timing_asset.details.get("rows") if timing_asset else None,
                    },
                    "files": files,
                }
            )
        reciters.append(
            {
                "remote_id": reciter.remote_id,
                "name": reciter.name,
                "qirat": reciter.qirat,
                "source": reciter.source,
                "status": reciter.status,
                "license_id": reciter.license_id,
                "license_url": reciter.license_url,
                "license_evidence_url": reciter.license_evidence_url,
                "attribution": reciter.attribution,
                "default_style": reciter_config["default_style"],
                "default_bitrate": reciter_config["default_bitrate"],
                "styles": styles,
            }
        )

    return {
        "audio_manifest_version": 1,
        "generated_by": {
            "name": config.name,
            "version": config.version,
            "pipeline_version": __version__,
        },
        "distribution_policy": {
            "deny_hosts": config.policy.get("deny_hosts", []),
            "deny_reason": config.policy.get("deny_reason", ""),
            "admission_rule": config.catalog_policy.get("admission_rule", ""),
        },
        "reciters": reciters,
        "timing_recitations": [
            {
                "remote_id": reciter.remote_id,
                "name": reciter.name,
                "style": reciter.style,
                "qirat": reciter.qirat,
                "status": reciter.status,
                "license_id": reciter.license_id,
                "license_url": reciter.license_url,
                "license_evidence_url": reciter.license_evidence_url,
                "attribution": reciter.attribution,
                "has_audio": False,
                "whole_ayah_segments": segment_counts.get(reciter.id, {}).get("whole_ayah", 0),
                "word_segments": segment_counts.get(reciter.id, {}).get("word", 0),
            }
            for reciter in sorted(timing_reciters, key=lambda item: item.id)
        ],
        "word_timing": {
            "source": config.word_timing.get("source"),
            "release_tag": config.word_timing.get("release_tag"),
            "release_page": config.word_timing.get("release_page"),
            "alignment_policy": config.word_timing.get("alignment_policy"),
            "excluded": [
                {
                    "remote_id": recitation.get("remote_id"),
                    "asset": recitation.get("asset"),
                    "reason": recitation.get("excluded_reason"),
                }
                for recitation in config.word_timing.get("recitations", [])
                if recitation.get("status") == "excluded"
            ],
        },
        "pending_reciter_candidates": [
            {
                "remote_id": reciter["remote_id"],
                "name": reciter["name"],
                "status": reciter.get("status", ""),
                "license_id": reciter["license_id"],
                "license_evidence_url": reciter["license_evidence_url"],
                "each": "enable in content-pipeline/config/reciters.json only after Quran Foundation confirms the source in writing (CD-2)",
            }
            for reciter in sorted(config.reciters, key=lambda item: item["remote_id"])
            if not reciter.get("enabled", False)
        ],
        "fallback_sources": [
            {
                "id": fallback.get("id"),
                "name": fallback.get("name"),
                "enabled": fallback.get("enabled", False),
                "status": fallback.get("status"),
                "note": fallback.get("note"),
            }
            for fallback in config.fallback_sources
        ],
    }


def build_credits(bundle: Bundle, config: PipelineConfig) -> dict[str, Any]:
    used_license_ids = sorted({asset.license_id for asset in bundle.assets})
    attributions = []
    seen: set[tuple[str, str]] = set()
    for asset in sorted(bundle.assets, key=lambda item: item.asset_id):
        key = (asset.license_id, asset.attribution)
        if key in seen:
            continue
        seen.add(key)
        attributions.append(
            {
                "asset_id": asset.asset_id,
                "kind": asset.kind,
                "text": asset.attribution,
                "license_id": asset.license_id,
                "license_url": asset.license_url,
            }
        )
    return {
        "credits_version": 1,
        "generated_by": {"name": config.name, "version": config.version},
        "licenses": [
            {
                "id": license_id,
                "name": config.licenses[license_id].get("name"),
                "spdx": config.licenses[license_id].get("spdx"),
                "url": config.licenses[license_id].get("url"),
                "obligations": config.licenses[license_id].get("obligations", []),
            }
            for license_id in used_license_ids
        ],
        "attributions": attributions,
    }


def _generated_at() -> str:
    epoch = os.environ.get("SOURCE_DATE_EPOCH", "")
    if epoch.isdigit():
        moment = datetime.fromtimestamp(int(epoch), tz=timezone.utc)
    else:
        moment = datetime.now(timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def write_artifacts(
    bundle: Bundle,
    config: PipelineConfig,
    schema_path: Path,
    output_dir: Path,
    *,
    checks: list[CheckResult],
    lock_path: Path,
    lock_created: bool,
    lock_updated: bool,
) -> PackageResult:
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = config.pipeline["outputs"]

    database_path = output_dir / outputs["database"]
    database_sha256, database_bytes, logical_digest = create_database(bundle, schema_path, database_path)

    database_info = {
        "file": outputs["database"],
        "sha256": database_sha256,
        "bytes": database_bytes,
        "logical_digest": logical_digest,
    }
    manifest = build_content_manifest(bundle, config, database_info)
    audio_manifest = build_audio_manifest(bundle, config)
    credits = build_credits(bundle, config)

    artifacts: dict[str, Path] = {}
    artifacts["content_manifest"] = output_dir / outputs["content_manifest"]
    artifacts["audio_manifest"] = output_dir / outputs["audio_manifest"]
    artifacts["license_credits"] = output_dir / outputs["license_credits"]
    artifacts["tanzil_notice"] = output_dir / outputs["tanzil_notice"]
    artifacts["build_report"] = output_dir / outputs["build_report"]

    artifacts["content_manifest"].write_bytes(canonical_json_bytes(manifest))
    artifacts["audio_manifest"].write_bytes(canonical_json_bytes(audio_manifest))
    artifacts["license_credits"].write_bytes(canonical_json_bytes(credits))
    artifacts["tanzil_notice"].write_bytes(bundle.notices["TANZIL-NOTICE.txt"])

    report = {
        "report_version": 1,
        "generated_at": _generated_at(),
        "pipeline": {"name": config.name, "version": config.version, "schema_version": config.schema_version},
        "content_mode": bundle.content_mode,
        "source_facts": bundle.source_facts,
        "counts": {key: value for key, value in manifest["bundle"].items() if key != "database"},
        "database": database_info,
        "checks": [{"name": check.name, "ok": check.ok, "detail": check.detail} for check in checks],
        "lock": {
            "path": str(lock_path),
            "created": lock_created,
            "updated": lock_updated,
        },
        "artifacts": {
            name: {"sha256": sha256_digest(path.read_bytes()), "bytes": path.stat().st_size}
            for name, path in sorted(artifacts.items())
            if path.exists()
        },
    }
    artifacts["build_report"].write_bytes(canonical_json_bytes(report))

    return PackageResult(
        output_dir=output_dir,
        database_path=database_path,
        database_sha256=database_sha256,
        database_bytes=database_bytes,
        logical_digest=logical_digest,
        artifacts=artifacts,
        manifest=manifest,
    )
