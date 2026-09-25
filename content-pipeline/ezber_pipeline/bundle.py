"""Immutable in-memory representation of the content bundle.

Everything downstream (validation, SQLite packaging, manifests) consumes this
structure, so there is exactly one normalization path.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Surah:
    id: int
    name_arabic: str
    name_latin: str
    name_english: str
    verses_count: int
    revelation: str
    bismillah_pre: int
    revelation_order: int | None
    rukus: int | None


@dataclass(frozen=True)
class Ayah:
    id: int
    surah_id: int
    ayah: int
    verse_key: str
    text_uthmani: str
    juz: int | None
    hizb: int | None
    page: int | None
    sajdah: int
    sajdah_type: str | None


@dataclass(frozen=True)
class Reciter:
    id: int
    remote_id: str
    name: str
    style: str
    qirat: str | None
    source: str
    license_id: str
    license_url: str
    license_evidence_url: str
    attribution: str
    has_segments: int
    enabled: int
    status: str


@dataclass(frozen=True)
class AudioFile:
    reciter_id: int
    kind: str
    surah_id: int | None
    ayah: int | None
    chapter: int | None
    variant: str
    url: str
    local_path: str | None
    bytes: int | None
    bitrate: int | None
    duration_ms: int | None
    checksum: str | None
    downloaded_at: str | None


@dataclass(frozen=True)
class Segment:
    reciter_id: int
    variant: str
    ayah_id: int
    word_index: int
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class Edition:
    id: int
    kind: str  # "translation" | "transliteration"
    resource_id: str
    name: str
    author: str | None
    language: str
    source: str
    license_id: str
    license_url: str
    license_evidence_url: str
    attribution: str


@dataclass(frozen=True)
class EditionRow:
    edition_id: int
    ayah_id: int
    text: str


@dataclass(frozen=True)
class Asset:
    asset_id: str
    kind: str
    description: str
    source_name: str
    source_url: str
    license_id: str
    license_url: str
    license_evidence_url: str
    attribution: str
    version: str | None = None
    sha256: str | None = None
    digest: str | None = None
    bytes: int | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class Bundle:
    surahs: list[Surah] = field(default_factory=list)
    ayahs: list[Ayah] = field(default_factory=list)
    reciters: list[Reciter] = field(default_factory=list)
    audio_files: list[AudioFile] = field(default_factory=list)
    segments: list[Segment] = field(default_factory=list)
    translations: list[Edition] = field(default_factory=list)
    translation_rows: list[EditionRow] = field(default_factory=list)
    transliterations: list[Edition] = field(default_factory=list)
    transliteration_rows: list[EditionRow] = field(default_factory=list)
    assets: list[Asset] = field(default_factory=list)
    notices: dict[str, bytes] = field(default_factory=dict)
    source_facts: dict[str, Any] = field(default_factory=dict)
    access_mode: str = "public-legacy"

    def ayah_by_key(self) -> dict[str, Ayah]:
        return {ayah.verse_key: ayah for ayah in self.ayahs}
