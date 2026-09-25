"""Internet Archive source: recitation audio and ayah timing for the Dhikr
Al-Huda catalog.

Admission control lives here as well as in ``validate``:

* the item metadata must declare the configured license URL (verified on every
  build against the live item, so a license that changes upstream stops the
  build);
* files are resolved by exact path so a missing surah fails loudly;
* archive.org-provided sha1/md5 sizes travel into the audio manifest, meaning
  the bundle pins the exact recording bytes without downloading gigabytes.
"""

from __future__ import annotations

import json
import urllib.parse
from dataclasses import dataclass
from typing import Any

from ..canonical import digest_json
from ..errors import FetchError, ValidationError
from ..fetch import Fetcher, FetchResult

ARCHIVE_DOWNLOAD_BASE = "https://archive.org/download"


@dataclass(frozen=True)
class IAFile:
    name: str
    size: int | None
    md5: str | None
    sha1: str | None
    format: str | None
    length_seconds: float | None

    def as_fact(self, url: str) -> dict[str, Any]:
        return {
            "path": self.name,
            "url": url,
            "bytes": self.size,
            "sha1": self.sha1,
            "md5": self.md5,
            "format": self.format,
            "duration_ms": round(self.length_seconds * 1000) if self.length_seconds else None,
        }


@dataclass(frozen=True)
class IAItem:
    identifier: str
    title: str
    license_url: str
    description: str
    files: dict[str, IAFile]
    metadata_digest: str

    def file(self, name: str) -> IAFile:
        try:
            return self.files[name]
        except KeyError:
            raise ValidationError(
                [f"archive.org item {self.identifier} has no file {name!r}"]
            ) from None

    def download_url(self, name: str) -> str:
        quoted = "/".join(urllib.parse.quote(part) for part in name.split("/"))
        return f"{ARCHIVE_DOWNLOAD_BASE}/{self.identifier}/{quoted}"


def normalize_license_url(url: str) -> str:
    normalized = (url or "").strip().lower()
    if normalized.startswith("http://"):
        normalized = "https://" + normalized[len("http://") :]
    if normalized and not normalized.endswith("/"):
        normalized += "/"
    return normalized


def parse_item(data: bytes, identifier: str | None = None) -> IAItem:
    try:
        payload = json.loads(data.decode("utf-8"))
        metadata = payload["metadata"]
        file_entries = payload.get("files", [])
    except (KeyError, ValueError, UnicodeDecodeError) as error:
        raise FetchError(f"unexpected archive.org metadata response: {error}") from error

    files: dict[str, IAFile] = {}
    for entry in file_entries:
        name = entry.get("name")
        if not name:
            continue
        length = entry.get("length")
        files[name] = IAFile(
            name=name,
            size=int(entry["size"]) if entry.get("size") not in (None, "") else None,
            md5=entry.get("md5") or None,
            sha1=entry.get("sha1") or None,
            format=entry.get("format") or None,
            length_seconds=float(length) if length not in (None, "") else None,
        )

    return IAItem(
        identifier=identifier or metadata.get("identifier", ""),
        title=metadata.get("title", ""),
        license_url=metadata.get("licenseurl", ""),
        description=metadata.get("description", ""),
        files=files,
        metadata_digest=digest_json(
            {"identifier": identifier or metadata.get("identifier", ""), "license_url": metadata.get("licenseurl", "")}
        ),
    )


def fetch_item(fetcher: Fetcher, item_id: str, metadata_url: str) -> tuple[IAItem, FetchResult]:
    result = fetcher.get(metadata_url)
    return parse_item(result.data, identifier=item_id), result


def check_license(item: IAItem, expected_prefix: str, source_label: str) -> None:
    actual = normalize_license_url(item.license_url)
    expected = normalize_license_url(expected_prefix)
    if not expected:
        raise ValidationError([f"{source_label}: expected_license_url_prefix is empty"])
    if not actual.startswith(expected):
        raise ValidationError(
            [
                f"{source_label}: archive.org item {item.identifier} declares license "
                f"{item.license_url!r}, expected one matching {expected_prefix!r}. "
                "Refusing to catalog this recording."
            ]
        )


def resolve_audio(
    item: IAItem,
    *,
    style: str,
    bitrate: int,
    extension: str,
    surah_count: int,
) -> list[dict[str, Any]]:
    """Resolve the 114 chapter files for one style/bitrate."""
    resolved = []
    for surah in range(1, surah_count + 1):
        name = f"{style}/{bitrate}/{surah:03d}.{extension}"
        ia_file = item.file(name)
        resolved.append(ia_file.as_fact(item.download_url(name)))
    return resolved


def fetch_timing(fetcher: Fetcher, item_id: str, timing_path: str) -> tuple[dict[int, list[tuple[int, int, int]]], bytes]:
    url = f"{ARCHIVE_DOWNLOAD_BASE}/{item_id}/{timing_path}"
    result = fetcher.get(url)
    return parse_timing(result.data), result.data


def parse_timing(data: bytes) -> dict[int, list[tuple[int, int, int]]]:
    """Parse timing.json: {"<chapter>": [{"ayah", "start", "end"}, ...]}."""
    try:
        payload = json.loads(data.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        raise FetchError(f"unexpected timing JSON: {error}") from error
    if not isinstance(payload, dict):
        raise ValidationError(["timing JSON root is not an object"])

    timing: dict[int, list[tuple[int, int, int]]] = {}
    for chapter_key, entries in payload.items():
        try:
            chapter = int(chapter_key)
        except (TypeError, ValueError):
            raise ValidationError([f"timing JSON has non-numeric chapter key {chapter_key!r}"]) from None
        if not isinstance(entries, list):
            raise ValidationError([f"timing JSON chapter {chapter} is not a list"])
        rows: list[tuple[int, int, int]] = []
        for entry in entries:
            try:
                ayah = int(entry["ayah"])
                start_ms = int(entry["start"])
                end_ms = int(entry["end"])
            except (KeyError, TypeError, ValueError) as error:
                raise ValidationError([f"timing JSON chapter {chapter} has a malformed entry: {error}"]) from None
            rows.append((ayah, start_ms, end_ms))
        timing[chapter] = rows
    return timing


def timing_digest(chapter_ayah_ids: dict[int, list[int]]) -> str:
    return digest_json([[chapter, ayah_ids] for chapter, ayah_ids in sorted(chapter_ayah_ids.items())])


def file_index_digest(facts: list[dict[str, Any]]) -> str:
    ordered = sorted(facts, key=lambda fact: fact["path"])
    return digest_json(ordered)
