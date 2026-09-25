"""Deterministic web/PWA export of the built content bundle.

The exporter reads the canonical build artifacts (the SQLite bundle created
from ``schema/content_schema.sql``, ``content-manifest.json`` and the Tanzil
notice) plus the license registry, and writes compact JSON the web app can seed
IndexedDB from. It never modifies the SQLite bundle or the manifests: the web
payload is a projection of exactly the same data, so the two cannot drift.

Layout (all JSON is canonical compact UTF-8, sorted keys, single trailing
newline):

    index.json             version, counts, content_meta, licence pointer and a
                           sha256/size inventory of every other file
    surahs.json            surahs table
    ayahs.json             ayahs table plus the primary transliteration edition
                           joined as a ``transliteration`` column
    words.json             words table
    reciters.json          reciters table
    audio-files.json       audio_files table (url, checksum, bytes, bitrate,
                           duration, kind, chapter/ayah); build-time download
                           bookkeeping (local_path, downloaded_at) is omitted
    segments/<reciter>.json  segments table for one reciter, with reciter_id and
                           variant hoisted into the file header
    transliterations.json  transliteration editions
    translations.json      translation editions (reserved and currently empty)
    licenses.json          used registry entries, attribution strings and the
                           notice digests
    TANZIL-NOTICE.txt      the verbatim Tanzil copyright notice

Payload files are table documents: ``{"columns": [...], "rows": [[...]]}``.
Rows mirror the schema columns in primary-key order, so a consumer can build
IndexedDB object stores without re-sorting.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass, field
from itertools import groupby
from pathlib import Path
from typing import Any

from .canonical import compact_json_bytes, digest_json, load_json, sha256_digest
from .config import CONTENT_SCHEMA_PATH, load_licenses
from .errors import PipelineError

WEB_BUNDLE_VERSION = 1
CONTENT_MANIFEST_FILENAME = "content-manifest.json"
TANZIL_NOTICE_FILENAME = "TANZIL-NOTICE.txt"
SEGMENTS_DIRNAME = "segments"

SURAH_COLUMNS = (
    "id",
    "name_arabic",
    "name_latin",
    "name_english",
    "verses_count",
    "revelation",
    "bismillah_pre",
    "revelation_order",
    "rukus",
)

AYAH_COLUMNS = (
    "id",
    "surah_id",
    "ayah",
    "verse_key",
    "text_uthmani",
    "transliteration",
    "juz",
    "hizb",
    "page",
    "sajdah",
    "sajdah_type",
)

WORD_COLUMNS = (
    "id",
    "ayah_id",
    "position",
    "text_uthmani",
    "transliteration",
    "translation",
)

RECITER_COLUMNS = (
    "id",
    "remote_id",
    "name",
    "style",
    "qirat",
    "source",
    "license_id",
    "license_url",
    "license_evidence_url",
    "attribution",
    "has_segments",
    "enabled",
)

AUDIO_FILE_COLUMNS = (
    "id",
    "reciter_id",
    "kind",
    "surah_id",
    "ayah",
    "chapter",
    "variant",
    "url",
    "bytes",
    "bitrate",
    "duration_ms",
    "checksum",
)

EDITION_COLUMNS = (
    "id",
    "resource_id",
    "name",
    "author",
    "language",
    "source",
    "license_id",
    "license_url",
    "license_evidence_url",
    "attribution",
)

SEGMENT_COLUMNS = ("ayah_id", "word_index", "start_ms", "end_ms")


@dataclass
class WebExportResult:
    web_dir: Path
    index_path: Path
    files: dict[str, dict[str, Any]] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)
    index: dict[str, Any] = field(default_factory=dict)


def _table(columns: tuple[str, ...], rows: list[tuple]) -> dict[str, Any]:
    return {"columns": list(columns), "rows": [list(row) for row in rows]}


def _open_readonly(database_path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"{database_path.resolve().as_uri()}?mode=ro", uri=True)


def _prepare_workdir(web_dir: Path) -> Path:
    """Validate the destination and return a private work directory beside it.

    Nothing is written until the export succeeds, so a failed run neither
    destroys a previous bundle nor leaves a half-written one behind.
    """
    if web_dir.exists():
        if not web_dir.is_dir():
            raise PipelineError(f"web output path is not a directory: {web_dir}")
        contents = list(web_dir.iterdir())
        if contents and not (web_dir / "index.json").exists():
            raise PipelineError(
                f"refusing to overwrite {web_dir}: it is not an Ezber web bundle "
                "(no index.json); choose another --web-dir"
            )
    work_dir = web_dir.with_name(f".{web_dir.name}.tmp-{os.getpid()}")
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True)
    return work_dir


def _commit_workdir(work_dir: Path, web_dir: Path) -> None:
    if web_dir.exists():
        shutil.rmtree(web_dir)
    work_dir.rename(web_dir)


def _read_tables(connection: sqlite3.Connection) -> dict[str, list[tuple]]:
    primary_edition = connection.execute("SELECT id FROM transliterations ORDER BY id LIMIT 1").fetchone()
    transliteration_id = primary_edition[0] if primary_edition else -1
    return {
        "content_meta": connection.execute(
            "SELECT key, value FROM content_meta ORDER BY key"
        ).fetchall(),
        "surahs": connection.execute(
            f"SELECT {', '.join(SURAH_COLUMNS)} FROM surahs ORDER BY id"
        ).fetchall(),
        "ayahs": connection.execute(
            "SELECT a.id, a.surah_id, a.ayah, a.verse_key, a.text_uthmani, t.text, "
            "a.juz, a.hizb, a.page, a.sajdah, a.sajdah_type "
            "FROM ayahs a "
            "LEFT JOIN transliteration_rows t "
            "ON t.ayah_id = a.id AND t.transliteration_id = ? "
            "ORDER BY a.id",
            (transliteration_id,),
        ).fetchall(),
        "words": connection.execute(
            f"SELECT {', '.join(WORD_COLUMNS)} FROM words ORDER BY id"
        ).fetchall(),
        "reciters": connection.execute(
            f"SELECT {', '.join(RECITER_COLUMNS)} FROM reciters ORDER BY id"
        ).fetchall(),
        "audio_files": connection.execute(
            "SELECT id, reciter_id, kind, surah_id, ayah, chapter, variant, url, "
            "bytes, bitrate, duration_ms, checksum "
            "FROM audio_files "
            "ORDER BY reciter_id, variant, COALESCE(bitrate, 0), kind, "
            "COALESCE(chapter, 0), COALESCE(ayah, 0), id"
        ).fetchall(),
        "translations": connection.execute(
            f"SELECT {', '.join(EDITION_COLUMNS)} FROM translations ORDER BY id"
        ).fetchall(),
        "transliterations": connection.execute(
            f"SELECT {', '.join(EDITION_COLUMNS)} FROM transliterations ORDER BY id"
        ).fetchall(),
    }


def _segment_batches(connection: sqlite3.Connection) -> Iterator[tuple[int, str, list[tuple]]]:
    """Yield (reciter_id, variant, rows) in primary-key order, one per reciter."""
    cursor = connection.execute(
        "SELECT reciter_id, variant, ayah_id, word_index, start_ms, end_ms "
        "FROM segments ORDER BY reciter_id, variant, ayah_id, word_index"
    )
    for reciter_id, group in groupby(cursor, key=lambda row: row[0]):
        rows = list(group)
        variants = {row[1] for row in rows}
        if len(variants) != 1:
            raise PipelineError(
                f"segments for reciter {reciter_id} use more than one variant; "
                "the web bundle expects one variant per reciter"
            )
        yield reciter_id, rows[0][1], [(row[2], row[3], row[4], row[5]) for row in rows]


def _licenses_document(
    manifest: dict[str, Any],
    tables: dict[str, list[tuple]],
    notice_entry: dict[str, Any],
) -> dict[str, Any]:
    """Registry entries actually used, their attribution strings and notices."""
    registry = load_licenses()
    used: set[str] = set()
    attributions: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(license_id: str, text: str, kind: str, identifier: str) -> None:
        used.add(license_id)
        key = (license_id, text)
        if key in seen:
            return
        seen.add(key)
        attributions.append(
            {
                "license_id": license_id,
                "text": text,
                "source_kind": kind,
                "source_id": identifier,
            }
        )

    for asset in sorted(manifest.get("assets", []), key=lambda item: item["asset_id"]):
        license_info = asset.get("license", {})
        add(license_info.get("id", ""), license_info.get("attribution", ""), "asset", asset["asset_id"])
    for row in tables["reciters"]:
        reciter = dict(zip(RECITER_COLUMNS, row))
        add(reciter["license_id"], reciter["attribution"], "reciter", reciter["remote_id"])
    for table, kind in (("translations", "translation"), ("transliterations", "transliteration")):
        for row in tables[table]:
            edition = dict(zip(EDITION_COLUMNS, row))
            add(edition["license_id"], edition["attribution"], kind, edition["resource_id"])

    missing = sorted(license_id for license_id in used if license_id not in registry)
    if missing:
        raise PipelineError(f"license registry is missing bundled license ids: {missing}")
    attributions.sort(
        key=lambda item: (item["license_id"], item["source_kind"], item["source_id"], item["text"])
    )
    return {
        "licenses": [registry[license_id] for license_id in sorted(used)],
        "attributions": attributions,
        "notices": [notice_entry],
    }


def _write_web_payloads(
    work_dir: Path,
    database_path: Path,
    manifest: dict[str, Any],
    schema_path: Path,
    notice_path: Path,
) -> tuple[dict[str, dict[str, Any]], dict[str, int], dict[str, Any]]:
    files: dict[str, dict[str, Any]] = {}

    def write_payload(relative_path: str, kind: str, value: Any, *, rows: int | None = None, **extra: Any) -> None:
        target = work_dir / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        data = compact_json_bytes(value)
        target.write_bytes(data)
        entry: dict[str, Any] = {
            "path": relative_path,
            "kind": kind,
            "sha256": sha256_digest(data),
            "bytes": len(data),
        }
        if rows is not None:
            entry["rows"] = rows
        entry.update(extra)
        files[relative_path] = entry

    connection = _open_readonly(database_path)
    try:
        tables = _read_tables(connection)

        write_payload("surahs.json", "surahs", _table(SURAH_COLUMNS, tables["surahs"]), rows=len(tables["surahs"]))
        write_payload("ayahs.json", "ayahs", _table(AYAH_COLUMNS, tables["ayahs"]), rows=len(tables["ayahs"]))
        write_payload("words.json", "words", _table(WORD_COLUMNS, tables["words"]), rows=len(tables["words"]))
        write_payload(
            "reciters.json", "reciters", _table(RECITER_COLUMNS, tables["reciters"]), rows=len(tables["reciters"])
        )
        write_payload(
            "audio-files.json",
            "audio_files",
            _table(AUDIO_FILE_COLUMNS, tables["audio_files"]),
            rows=len(tables["audio_files"]),
        )
        write_payload(
            "translations.json",
            "translations",
            _table(EDITION_COLUMNS, tables["translations"]),
            rows=len(tables["translations"]),
        )
        write_payload(
            "transliterations.json",
            "transliterations",
            _table(EDITION_COLUMNS, tables["transliterations"]),
            rows=len(tables["transliterations"]),
        )

        segment_count = 0
        for reciter_id, variant, rows in _segment_batches(connection):
            segment_count += len(rows)
            write_payload(
                f"{SEGMENTS_DIRNAME}/{reciter_id}.json",
                "segments",
                {
                    "reciter_id": reciter_id,
                    "variant": variant,
                    "columns": list(SEGMENT_COLUMNS),
                    "rows": [list(row) for row in rows],
                },
                rows=len(rows),
                reciter_id=reciter_id,
                variant=variant,
            )
    finally:
        connection.close()

    notice_data = notice_path.read_bytes()
    (work_dir / TANZIL_NOTICE_FILENAME).write_bytes(notice_data)
    notice_entry = {
        "path": TANZIL_NOTICE_FILENAME,
        "kind": "notice",
        "sha256": sha256_digest(notice_data),
        "bytes": len(notice_data),
    }
    files[TANZIL_NOTICE_FILENAME] = notice_entry

    licenses = _licenses_document(manifest, tables, notice_entry)
    write_payload(
        "licenses.json",
        "licenses",
        licenses,
        rows=len(licenses["attributions"]),
        license_count=len(licenses["licenses"]),
    )

    meta = {key: value for key, value in tables["content_meta"]}
    counts = {
        "surahs": len(tables["surahs"]),
        "ayahs": len(tables["ayahs"]),
        "words": len(tables["words"]),
        "reciters": len(tables["reciters"]),
        "audio_files": len(tables["audio_files"]),
        "segments": segment_count,
        "translations": len(tables["translations"]),
        "transliterations": len(tables["transliterations"]),
    }
    file_list = [files[path] for path in sorted(files)]
    index = {
        "web_bundle_version": WEB_BUNDLE_VERSION,
        "generated_by": manifest.get("generated_by", {}),
        "content_mode": meta.get("content_mode", (manifest.get("content_policy") or {}).get("mode")),
        "schema_version": int(meta.get("schema_version", 0)),
        "schema_sha256": sha256_digest(schema_path.read_bytes()),
        "logical_digest": meta.get("logical_digest"),
        "database": manifest["bundle"]["database"],
        "counts": counts,
        "meta": meta,
        "distribution_policy": manifest.get("distribution_policy", {}),
        "licenses_file": "licenses.json",
        "files": file_list,
        "bundle_digest": digest_json(file_list),
    }
    (work_dir / "index.json").write_bytes(compact_json_bytes(index))
    return files, counts, index


def export_web(
    build_dir: Path,
    *,
    web_dir: Path | None = None,
    schema_path: Path = CONTENT_SCHEMA_PATH,
) -> WebExportResult:
    """Write ``build_dir/web`` (or ``web_dir``) from the built content bundle."""
    build_dir = Path(build_dir)
    web_dir = Path(web_dir) if web_dir else build_dir / "web"

    manifest_path = build_dir / CONTENT_MANIFEST_FILENAME
    if not manifest_path.exists():
        raise PipelineError(f"no content manifest at {manifest_path}; run `build` first")
    manifest = load_json(str(manifest_path))

    database_info = manifest["bundle"]["database"]
    database_path = build_dir / database_info["file"]
    if not database_path.exists():
        raise PipelineError(f"no content database at {database_path}; run `build` first")
    database_digest = sha256_digest(database_path.read_bytes())
    if database_digest != database_info["sha256"]:
        raise PipelineError(
            f"content database sha256 {database_digest} does not match the manifest "
            f"{database_info['sha256']}; rebuild before exporting"
        )

    notice_path = build_dir / TANZIL_NOTICE_FILENAME
    if not notice_path.exists():
        raise PipelineError(f"no Tanzil notice at {notice_path}; run `build` first")
    if not schema_path.exists():
        raise PipelineError(f"content schema not found: {schema_path}")

    work_dir = _prepare_workdir(web_dir)
    try:
        files, counts, index = _write_web_payloads(
            work_dir, database_path, manifest, schema_path, notice_path
        )
        _commit_workdir(work_dir, web_dir)
    except BaseException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    return WebExportResult(
        web_dir=web_dir,
        index_path=web_dir / "index.json",
        files=files,
        counts=counts,
        index=index,
    )
