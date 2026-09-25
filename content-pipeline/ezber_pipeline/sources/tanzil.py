"""Tanzil source: Quran text v1.1 (Uthmani XML) and the Tanzil metadata file.

Text handling rule: the pipeline never edits, reorders or normalizes Quran
text. It parses the XML attribute value and stores exactly those code points;
``validate`` re-checks the round trip against the source bytes.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from ..errors import FetchError, ValidationError
from ..fetch import Fetcher, FetchResult


@dataclass(frozen=True)
class TanzilAyahRaw:
    ayah: int
    text: str
    bismillah: str | None


@dataclass(frozen=True)
class TanzilSurahRaw:
    index: int
    name_arabic: str
    ayahs: list[TanzilAyahRaw] = field(default_factory=list)


@dataclass(frozen=True)
class TanzilText:
    version: str
    notice: str
    surahs: list[TanzilSurahRaw]
    raw: bytes


@dataclass(frozen=True)
class TanzilSurahMeta:
    index: int
    ayas: int
    start: int
    name_arabic: str
    name_latin: str
    name_english: str
    revelation: str
    order: int
    rukus: int


@dataclass(frozen=True)
class TanzilMetadata:
    version: str
    surahs: list[TanzilSurahMeta]
    juz_starts: list[tuple[int, str]]      # (juz index 1..30, verse_key)
    quarter_starts: list[tuple[int, str]]  # (quarter index 1..240, verse_key)
    page_starts: list[tuple[int, str]]     # (page index 1..604, verse_key)
    sajdas: dict[str, str]                 # verse_key -> "recommended"|"obligatory"
    raw: bytes


def _decode(data: bytes) -> str:
    return data.decode("utf-8-sig")


def _extract_notice(text: str) -> str:
    match = re.search(r"<!--(.*?)-->", text, re.DOTALL)
    if not match:
        raise ValidationError(["Tanzil text download has no copyright notice comment"])
    notice = match.group(1).replace("\r\n", "\n").strip("\n")
    return notice + "\n"


def parse_text_xml(data: bytes) -> TanzilText:
    text = _decode(data)
    notice = _extract_notice(text)
    version_match = re.search(r"Version\s+([0-9]+\.[0-9]+)", notice)
    version = version_match.group(1) if version_match else "unknown"

    root = ET.fromstring(data)
    surahs: list[TanzilSurahRaw] = []
    for surah_element in root.findall("sura"):
        index = int(surah_element.attrib["index"])
        ayahs = []
        for ayah_element in surah_element.findall("aya"):
            ayahs.append(
                TanzilAyahRaw(
                    ayah=int(ayah_element.attrib["index"]),
                    text=ayah_element.attrib["text"],
                    bismillah=ayah_element.attrib.get("bismillah"),
                )
            )
        surahs.append(
            TanzilSurahRaw(index=index, name_arabic=surah_element.attrib["name"], ayahs=ayahs)
        )
    if not surahs:
        raise ValidationError(["Tanzil text download contains no surahs"])
    return TanzilText(version=version, notice=notice, surahs=surahs, raw=data)


def parse_metadata_xml(data: bytes) -> TanzilMetadata:
    root = ET.fromstring(data)
    version = root.attrib.get("version", "unknown")

    surahs: list[TanzilSurahMeta] = []
    for element in root.findall("./suras/sura"):
        surahs.append(
            TanzilSurahMeta(
                index=int(element.attrib["index"]),
                ayas=int(element.attrib["ayas"]),
                start=int(element.attrib["start"]),
                name_arabic=element.attrib["name"],
                name_latin=element.attrib["tname"],
                name_english=element.attrib["ename"],
                revelation=element.attrib["type"],
                order=int(element.attrib["order"]),
                rukus=int(element.attrib["rukus"]),
            )
        )

    juz_starts = [
        (int(element.attrib["index"]), f"{element.attrib['sura']}:{element.attrib['aya']}")
        for element in root.findall("./juzs/juz")
    ]
    quarter_starts = [
        (int(element.attrib["index"]), f"{element.attrib['sura']}:{element.attrib['aya']}")
        for element in root.findall("./hizbs/quarter")
    ]
    page_starts = [
        (int(element.attrib["index"]), f"{element.attrib['sura']}:{element.attrib['aya']}")
        for element in root.findall("./pages/page")
    ]
    sajdas = {
        f"{element.attrib['sura']}:{element.attrib['aya']}": element.attrib["type"]
        for element in root.findall("./sajdas/sajda")
    }
    if not surahs:
        raise ValidationError(["Tanzil metadata download contains no surahs"])
    return TanzilMetadata(
        version=version,
        surahs=surahs,
        juz_starts=juz_starts,
        quarter_starts=quarter_starts,
        page_starts=page_starts,
        sajdas=sajdas,
        raw=data,
    )


def fetch_text(fetcher: Fetcher, url: str) -> FetchResult:
    result = fetcher.get(url)
    if b"<quran" not in result.data:
        raise FetchError(f"Tanzil text download at {url} is not a Quran XML document")
    return result


def fetch_metadata(fetcher: Fetcher, url: str) -> FetchResult:
    result = fetcher.get(url)
    if b"<quran" not in result.data:
        raise FetchError(f"Tanzil metadata download at {url} is not a Quran XML document")
    return result


def check_notice(notice: str, canonical_notice: Path) -> None:
    """The committed notice must keep matching the upstream copyright block."""
    if not canonical_notice.exists():
        raise ValidationError([f"canonical Tanzil notice file missing: {canonical_notice}"])
    canonical = canonical_notice.read_text(encoding="utf-8")
    if notice.strip() != canonical.strip():
        raise ValidationError(
            [
                "Tanzil copyright notice changed upstream; review the new terms and update "
                f"{canonical_notice} deliberately"
            ]
        )
