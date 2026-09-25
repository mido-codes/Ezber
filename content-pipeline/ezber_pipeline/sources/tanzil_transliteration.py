"""Tanzil English transliteration source (edition ``en.transliteration``).

The Tanzil translations repository renders each edition as one page that
contains the full text followed by a provenance header. The page wraps
presentation-only markup around some letters (``<b>``/``<u>``/``<i>``); the
parser removes that markup without changing the transliteration letters, and
compares the provenance header against the committed notice file so a changed
edition stops the build.
"""

from __future__ import annotations

import html as html_module
import re
from dataclasses import dataclass
from pathlib import Path

from ..canonical import sha256_digest
from ..errors import FetchError, ValidationError
from ..fetch import Fetcher, FetchResult

VERSE_LINE = re.compile(r"^(\d+)\|(\d+)\|(.*)$", re.MULTILINE)
TAG = re.compile(r"<[^>]*>")
NOTICE_BLOCK = re.compile(
    r"# -+\n#\n#  Quran Translation\n(?:#.*\n)+?# -+\n"
)


@dataclass(frozen=True)
class TransliterationCorpus:
    rows: dict[str, str]  # verse_key -> transliteration line
    header: str
    version: str
    raw: bytes

    @property
    def digest(self) -> str:
        return sha256_digest(self.raw)

    @property
    def token_count(self) -> int:
        return sum(len(line.split()) for line in self.rows.values())


def fetch_corpus(fetcher: Fetcher, url: str) -> FetchResult:
    return fetcher.get(url)


def parse_corpus(data: bytes, *, expected_verses: int) -> TransliterationCorpus:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise FetchError(f"Tanzil transliteration page is not UTF-8: {error}") from error

    rows: dict[str, str] = {}
    for surah, ayah, raw_line in VERSE_LINE.findall(text):
        line = html_module.unescape(TAG.sub("", raw_line)).strip()
        rows[f"{int(surah)}:{int(ayah)}"] = line
    if len(rows) != expected_verses:
        raise ValidationError(
            [f"Tanzil transliteration page has {len(rows)} verse lines, expected {expected_verses}"]
        )

    notice_match = NOTICE_BLOCK.search(text)
    if not notice_match:
        raise ValidationError(["Tanzil transliteration page has no provenance header"])
    header = notice_match.group(0).replace("\r\n", "\n").strip("\n") + "\n"
    version_match = re.search(r"Last Update:\s*(.+)", header)
    version = version_match.group(1).strip() if version_match else "unknown"

    return TransliterationCorpus(rows=rows, header=header, version=version, raw=data)


def check_provenance(header: str, canonical_notice: Path) -> None:
    """The committed provenance block must keep matching the upstream header."""
    if not canonical_notice.exists():
        raise ValidationError([f"canonical Tanzil transliteration provenance file missing: {canonical_notice}"])
    canonical = canonical_notice.read_text(encoding="utf-8")
    if header.strip() != canonical.strip():
        raise ValidationError(
            [
                "Tanzil transliteration provenance header changed upstream; review the edition and "
                f"update {canonical_notice} deliberately"
            ]
        )
