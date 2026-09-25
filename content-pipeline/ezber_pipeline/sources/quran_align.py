"""cpfair/quran-align source: word-accurate timings for 12 recitations.

The release archive contains one JSON file per recitation. Each item holds
``segments`` of the form ``[word_start, word_end, start_msec, end_msec]`` where
word indices are 0-based positions in the Tanzil Uthmani text split on spaces.

The released data is not perfectly clean: a few segments have the end before
the start, zero-length segments exist, some ayahs lack a ``segments`` key
entirely, and one of the twelve files is an align-tool crash log. The parser
returns the data as-is; :mod:`ezber_pipeline.timing` applies the documented,
deterministic repairs and reports their counts.
"""

from __future__ import annotations

import io
import json
import zipfile
from dataclasses import dataclass, field
from typing import Any

from ..errors import FetchError, ValidationError
from ..fetch import Fetcher, FetchResult


@dataclass(frozen=True)
class QASegment:
    word_start: int  # 0-based, inclusive
    word_end: int    # 0-based, exclusive
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class QAAyah:
    surah: int
    ayah: int
    segments: list[QASegment] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)


def fetch_archive(fetcher: Fetcher, url: str) -> FetchResult:
    return fetcher.get(url)


def read_asset(archive_bytes: bytes, asset_name: str) -> bytes:
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            return archive.read(asset_name)
    except (zipfile.BadZipFile, KeyError) as error:
        raise FetchError(f"quran-align archive: cannot read {asset_name!r}: {error}") from error


def parse_asset(data: bytes, asset_name: str) -> dict[tuple[int, int], QAAyah]:
    try:
        payload = json.loads(data.decode("utf-8-sig"))
    except (ValueError, UnicodeDecodeError) as error:
        raise FetchError(f"quran-align asset {asset_name!r} is not valid JSON: {error}") from error
    if not isinstance(payload, list):
        raise ValidationError([f"quran-align asset {asset_name!r} root is not a list"])

    ayat: dict[tuple[int, int], QAAyah] = {}
    for item in payload:
        try:
            surah = int(item["surah"])
            ayah = int(item["ayah"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValidationError([f"quran-align asset {asset_name!r} has a malformed ayah entry: {error}"]) from None
        segments = []
        for raw in item.get("segments", []):
            try:
                word_start, word_end, start_ms, end_ms = (int(value) for value in raw[:4])
            except (TypeError, ValueError) as error:
                raise ValidationError(
                    [f"quran-align asset {asset_name!r} {surah}:{ayah} has a malformed segment: {error}"]
                ) from None
            segments.append(
                QASegment(
                    word_start=word_start,
                    word_end=word_end,
                    start_ms=start_ms,
                    end_ms=end_ms,
                )
            )
        ayat[(surah, ayah)] = QAAyah(
            surah=surah, ayah=ayah, segments=segments, stats=dict(item.get("stats", {}))
        )
    return ayat
