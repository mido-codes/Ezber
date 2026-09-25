"""Command-line interface: build, verify, show-config, export-web."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

from . import __version__
from .canonical import load_json, sha256_digest
from .config import CONTENT_SCHEMA_PATH, DEFAULT_CACHE_DIR, DEFAULT_OUTPUT_DIR, PipelineConfig, load_config
from .errors import PipelineError
from .fetch import Fetcher
from .lockfile import LockBook
from .normalize import build_bundle
from .package import write_artifacts
from .validate import ensure_valid
from .webexport import export_web

LOCK_FILENAME = "source-lock.json"


def _build(args: argparse.Namespace) -> int:
    config: PipelineConfig = load_config(Path(args.config_dir) if args.config_dir else None)
    output_dir = Path(args.output_dir) if args.output_dir else DEFAULT_OUTPUT_DIR
    cache_dir = Path(args.cache_dir) if args.cache_dir else DEFAULT_CACHE_DIR
    lock_path = Path(args.lock) if args.lock else config.config_dir / LOCK_FILENAME

    http_config = config.http
    fetcher = Fetcher(
        cache_dir,
        offline=args.offline,
        timeout_seconds=int(http_config["timeout_seconds"]),
        retries=int(http_config["retries"]),
        retry_backoff_seconds=float(http_config["retry_backoff_seconds"]),
        user_agent=config.user_agent,
    )
    lock = LockBook(lock_path, update=args.update_lock)

    bundle = build_bundle(
        config,
        fetcher,
        lock,
        verify_audio_sample=args.verify_audio_sample or 0,
    )
    checks = ensure_valid(bundle, config)
    lock.write()
    result = write_artifacts(
        bundle,
        config,
        schema_path=CONTENT_SCHEMA_PATH,
        output_dir=output_dir,
        checks=checks,
        lock_path=lock_path,
        lock_created=lock.created,
        lock_updated=lock.updated,
    )

    print(f"bundle:        {result.database_path}")
    print(f"database:      {result.database_bytes:,} bytes  {result.database_sha256}")
    print(f"logical hash:  {result.logical_digest}")
    print(
        "counts:        "
        f"{len(bundle.surahs)} surahs, {len(bundle.ayahs)} ayahs, "
        f"{len(bundle.reciters)} reciters, {len(bundle.audio_files)} audio files, "
        f"{len(bundle.segments)} segments"
    )
    print(f"content mode:  {bundle.content_mode}")
    for name, path in sorted(result.artifacts.items()):
        print(f"{name + ':':<15}{path}")
    return 0


def _verify(args: argparse.Namespace) -> int:
    config = load_config(Path(args.config_dir) if args.config_dir else None)
    output_dir = Path(args.output_dir) if args.output_dir else DEFAULT_OUTPUT_DIR
    manifest_path = output_dir / config.pipeline["outputs"]["content_manifest"]
    if not manifest_path.exists():
        raise PipelineError(f"no content manifest at {manifest_path}; run `build` first")
    manifest = load_json(str(manifest_path))
    failures: list[str] = []

    database = manifest["bundle"]["database"]
    database_path = output_dir / database["file"]
    if not database_path.exists():
        failures.append(f"database missing: {database_path}")
    else:
        digest = sha256_digest(database_path.read_bytes())
        if digest != database["sha256"]:
            failures.append("database sha256 does not match the manifest")

    deny_fragments = [fragment.lower() for fragment in manifest["distribution_policy"].get("deny_url_substrings", [])]
    deny_hosts = [host.lower() for host in manifest["distribution_policy"].get("deny_hosts", [])]
    for asset in manifest["assets"]:
        for url in (asset["source"]["url"], asset["license"]["evidence_url"]):
            lowered = (url or "").lower()
            if any(fragment in lowered for fragment in deny_fragments) or any(host in lowered for host in deny_hosts):
                failures.append(f"asset {asset['asset_id']} references a denied source")
        if not asset["license"].get("attribution"):
            failures.append(f"asset {asset['asset_id']} has no attribution")

    if database_path.exists():
        connection = sqlite3.connect(str(database_path))
        try:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                failures.append(f"sqlite integrity_check: {integrity}")
            foreign_key_problems = connection.execute("PRAGMA foreign_key_check").fetchall()
            if foreign_key_problems:
                failures.append(f"foreign key violations: {foreign_key_problems[:3]}")
            expected = manifest["bundle"]
            table_counts = {
                "surahs": "surahs",
                "ayahs": "ayahs",
                "words": "words",
                "reciters": "reciters",
                "audio_files": "audio_files",
                "segments": "segments",
            }
            for key, table in table_counts.items():
                actual = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                if actual != expected[key]:
                    failures.append(f"table {table}: {actual} rows, manifest says {expected[key]}")
            meta = dict(connection.execute("SELECT key, value FROM content_meta").fetchall())
            if meta.get("logical_digest") != expected["database"]["logical_digest"]:
                failures.append("content_meta logical_digest does not match the manifest")
        finally:
            connection.close()

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print("verify: ok")
    print(f"database logical digest: {database['logical_digest']}")
    return 0


def _export_web(args: argparse.Namespace) -> int:
    output_dir = Path(args.output_dir) if args.output_dir else DEFAULT_OUTPUT_DIR
    web_dir = Path(args.web_dir) if args.web_dir else None
    result = export_web(output_dir, web_dir=web_dir)
    print(f"web bundle:    {result.web_dir}")
    print(f"index:         {result.index_path}")
    print(
        "counts:        "
        f"{result.counts['surahs']} surahs, {result.counts['ayahs']} ayahs, "
        f"{result.counts['words']} words, {result.counts['reciters']} reciters, "
        f"{result.counts['audio_files']} audio files, {result.counts['segments']} segments"
    )
    total = result.index_path.stat().st_size + sum(entry["bytes"] for entry in result.files.values())
    print(f"payload:       {len(result.files) + 1} files, {total:,} bytes")
    print(f"bundle digest: {result.index['bundle_digest']}")
    return 0


def _show_config(args: argparse.Namespace) -> int:
    config = load_config(Path(args.config_dir) if args.config_dir else None)
    summary = {
        "pipeline": {"name": config.name, "version": config.version},
        "content_policy": config.content_policy,
        "sources": {
            source_id: {"url": source.url, "license_id": source.license_id}
            for source_id, source in sorted(config.sources.items())
        },
        "transliteration": {
            "resource_id": config.transliteration.get("edition", {}).get("resource_id"),
            "license_id": config.transliteration.get("edition", {}).get("license_id"),
        },
        "word_timing": {
            "enabled": config.word_timing.get("enabled"),
            "source": config.word_timing.get("source"),
            "release_tag": config.word_timing.get("release_tag"),
            "enabled_recitations": [
                recitation["remote_id"] for recitation in config.enabled_timing_recitations()
            ],
            "excluded_recitations": [
                recitation["remote_id"]
                for recitation in config.word_timing.get("recitations", [])
                if recitation.get("status") == "excluded"
            ],
        },
        "reciters": [
            {
                "remote_id": reciter["remote_id"],
                "enabled": reciter.get("enabled"),
                "license_id": reciter["license_id"],
                "status": reciter.get("status"),
                "styles": [style["id"] for style in reciter["styles"]],
            }
            for reciter in config.reciters
        ],
        "fallback_sources": [
            {"id": fallback.get("id"), "enabled": fallback.get("enabled", False)}
            for fallback in config.fallback_sources
        ],
        "deny_hosts": config.policy.get("deny_hosts", []),
        "license_registry": sorted(config.licenses),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False, sort_keys=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ezber-pipeline",
        description="Fetch, normalize, validate and package Ezber Quran content.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="run the full pipeline and write the bundle")
    build.add_argument("--config-dir")
    build.add_argument("--output-dir")
    build.add_argument("--cache-dir")
    build.add_argument("--lock", help="path to source-lock.json")
    build.add_argument("--offline", action="store_true", help="use only the HTTP cache, never the network")
    build.add_argument("--update-lock", action="store_true", help="accept upstream changes and rewrite the lock")
    build.add_argument(
        "--verify-audio-sample",
        type=int,
        default=0,
        help="download and sha1-verify this many chapter files",
    )
    build.set_defaults(func=_build)

    verify = subparsers.add_parser("verify", help="verify a previously built bundle")
    verify.add_argument("--config-dir")
    verify.add_argument("--output-dir")
    verify.set_defaults(func=_verify)

    export = subparsers.add_parser(
        "export-web",
        help="export the built bundle as a compact JSON web/PWA payload under <output-dir>/web",
    )
    export.add_argument("--output-dir", help="build directory holding the SQLite bundle and manifests")
    export.add_argument("--web-dir", help="destination directory (default: <output-dir>/web)")
    export.set_defaults(func=_export_web)

    show = subparsers.add_parser("show-config", help="print the resolved configuration without secrets")
    show.add_argument("--config-dir")
    show.set_defaults(func=_show_config)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except PipelineError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
