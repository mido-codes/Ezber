"""Shared test helpers: deterministic synthetic corpus and a fake fetcher.

The end-to-end test builds the *entire* pipeline output (114 surahs, 6236
ayahs, enabled synthetic reciters and an optional word-level adapter) from
generated fixtures, so packaging, validation, locking and determinism are all
exercised without the network.
"""

from __future__ import annotations

import json
import shutil
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ezber_pipeline.canonical import sha256_hex
from ezber_pipeline.config import PipelineConfig, load_config
from ezber_pipeline.fetch import FetchResult
from ezber_pipeline.sources import word_level

TESTS_DIR = Path(__file__).resolve().parent
FIXTURES_DIR = TESTS_DIR / "fixtures"
REPO_ROOT = TESTS_DIR.parents[1]

FIXTURE_WORD_SOURCE = "fixture_word_level"


def verse_counts() -> dict[int, int]:
    raw = json.loads((FIXTURES_DIR / "surah_verse_counts.json").read_text(encoding="utf-8"))
    return {int(key): int(value) for key, value in raw.items()}


def synthetic_ayah_text(surah: int, ayah: int) -> str:
    return f"سورة {surah} آية {ayah}"


def synthetic_translation(surah: int, ayah: int) -> str:
    return f"Translation {surah}:{ayah}"


def synthetic_transliteration(surah: int, ayah: int) -> str:
    return f"Transliteration {surah}:{ayah}"


def synthetic_verse_keys() -> list[str]:
    keys: list[str] = []
    for surah, count in sorted(verse_counts().items()):
        for ayah in range(1, count + 1):
            keys.append(f"{surah}:{ayah}")
    return keys


def _notice_text() -> str:
    notice = (REPO_ROOT / "licenses" / "notices" / "tanzil-quran-text-1.1-notice.txt").read_text(
        encoding="utf-8"
    )
    return notice.strip("\n")


def synthetic_tanzil_text_xml() -> bytes:
    root = ET.Element("quran")
    for surah, count in sorted(verse_counts().items()):
        surah_element = ET.SubElement(root, "sura", {"index": str(surah), "name": f"سورة-{surah}"})
        for ayah in range(1, count + 1):
            attributes = {"index": str(ayah), "text": synthetic_ayah_text(surah, ayah)}
            if ayah == 1 and surah not in (1, 9):
                attributes["bismillah"] = "بسم الله"
            ET.SubElement(surah_element, "aya", attributes)
    body = ET.tostring(root, encoding="unicode")
    return (
        '<?xml version="1.0" encoding="utf-8" ?>\n'
        f"<!--\n{_notice_text()}\n-->\n"
        f"{body}\n"
    ).encode("utf-8")


def synthetic_tanzil_metadata_xml() -> bytes:
    root = ET.Element("quran", {"type": "metadata", "version": "1.0", "license": "cc-by"})
    suras = ET.SubElement(root, "suras")
    offset = 0
    for surah, count in sorted(verse_counts().items()):
        ET.SubElement(
            suras,
            "sura",
            {
                "index": str(surah),
                "ayas": str(count),
                "start": str(offset),
                "name": f"سورة-{surah}",
                "tname": f"Surah-{surah}",
                "ename": f"Surah {surah}",
                "type": "Meccan" if surah % 2 else "Medinan",
                "order": str(((surah + 50) % 114) + 1),
                "rukus": "1",
            },
        )
        offset += count

    order = synthetic_verse_keys()

    def boundary_keys(count: int) -> list[str]:
        return [order[min(len(order) - 1, round(index * len(order) / count))] for index in range(count)]

    juzs = ET.SubElement(root, "juzs")
    for index, verse_key in enumerate(boundary_keys(30), start=1):
        surah, ayah = verse_key.split(":")
        ET.SubElement(juzs, "juz", {"index": str(index), "sura": surah, "aya": ayah})

    hizbs = ET.SubElement(root, "hizbs")
    for index, verse_key in enumerate(boundary_keys(240), start=1):
        surah, ayah = verse_key.split(":")
        ET.SubElement(hizbs, "quarter", {"index": str(index), "sura": surah, "aya": ayah})

    pages = ET.SubElement(root, "pages")
    for index, verse_key in enumerate(boundary_keys(604), start=1):
        surah, ayah = verse_key.split(":")
        ET.SubElement(pages, "page", {"index": str(index), "sura": surah, "aya": ayah})

    sajdas = ET.SubElement(root, "sajdas")
    for index, verse_key in enumerate(order[::400][:15], start=1):
        surah, ayah = verse_key.split(":")
        ET.SubElement(
            sajdas,
            "sajda",
            {"index": str(index), "sura": surah, "aya": ayah, "type": "obligatory" if index % 2 else "recommended"},
        )

    body = ET.tostring(root, encoding="unicode")
    return ('<?xml version="1.0" encoding="utf-8" ?>\n' + body + "\n").encode("utf-8")


def synthetic_timing(preamble: bool, style: str) -> bytes:
    payload: dict[str, Any] = {}
    for surah, count in sorted(verse_counts().items()):
        rows = []
        cursor = 0
        if preamble:
            rows.append({"ayah": 0, "start": 0, "end": 400})
            cursor = 400
        for ayah in range(1, count + 1):
            start = cursor
            end = start + 1000
            rows.append({"ayah": ayah, "start": start, "end": end})
            cursor = end
        payload[str(surah)] = rows
    return json.dumps(payload).encode("utf-8")


def synthetic_ia_metadata(item_id: str, styles: dict[str, list[int]]) -> bytes:
    files = []
    for style, bitrates in styles.items():
        for bitrate in bitrates:
            for surah, count in sorted(verse_counts().items()):
                duration = 30 + 2 * count + (400 if style == "murattal" else 0)
                files.append(
                    {
                        "name": f"{style}/{bitrate}/{surah:03d}.m4a",
                        "size": str(1000 + surah),
                        "md5": f"{surah:032x}"[-32:],
                        "sha1": f"{surah:040x}"[-40:],
                        "format": "MPEG-4 Audio",
                        "length": f"{duration}.0",
                    }
                )
    payload = {
        "metadata": {
            "identifier": item_id,
            "title": f"Synthetic recitation {item_id}",
            "description": "Synthetic fixture recording",
            "licenseurl": "https://creativecommons.org/licenses/by/4.0/",
        },
        "files": files,
    }
    return json.dumps(payload).encode("utf-8")


def synthetic_word_level_data(
    *,
    reciter_remote_id: str = "fake-reciter-a",
    variant: str = "murattal",
    words_per_ayah: int = 2,
) -> word_level.WordLevelData:
    """Word transliteration + timing aligned to `synthetic_timing(preamble=False)`."""
    words: list[word_level.WordToken] = []
    timings: list[word_level.WordTiming] = []
    slice_ms = 1000 // words_per_ayah
    for surah, count in sorted(verse_counts().items()):
        for ayah in range(1, count + 1):
            ayah_start = (ayah - 1) * 1000
            for position in range(1, words_per_ayah + 1):
                words.append(
                    word_level.WordToken(
                        surah=surah,
                        ayah=ayah,
                        position=position,
                        transliteration=f"w{surah}-{ayah}-{position}",
                    )
                )
                timings.append(
                    word_level.WordTiming(
                        surah=surah,
                        ayah=ayah,
                        position=position,
                        start_ms=ayah_start + (position - 1) * slice_ms,
                        end_ms=ayah_start + position * slice_ms,
                    )
                )
    return word_level.WordLevelData(
        source_id=FIXTURE_WORD_SOURCE,
        name="Fixture word transliteration",
        language="en",
        license_id="cc-by-4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        license_evidence_url="https://example.org/fixture-word-source",
        attribution="Fixture word-level transliteration (test only)",
        words=words,
        timing_target=word_level.TimingTarget(reciter_remote_id=reciter_remote_id, variant=variant),
        timings=timings,
    )


class FakeWordLevelAdapter:
    source_id = FIXTURE_WORD_SOURCE

    def __init__(self, data: word_level.WordLevelData) -> None:
        self.data = data

    def fetch(self, fetcher, *, verse_counts):  # noqa: ANN001 - mirrors the protocol
        return self.data


def register_fixture_word_adapter(data: word_level.WordLevelData | None = None) -> word_level.WordLevelData:
    data = data or synthetic_word_level_data()
    word_level.register_adapter(FIXTURE_WORD_SOURCE, lambda: FakeWordLevelAdapter(data))
    return data


@dataclass
class FakeFetcher:
    routes: dict[str, bytes]
    requested: list[str] | None = None

    def __post_init__(self) -> None:
        self.requested = []

    def get(self, url: str, *, use_cache: bool = True, headers: dict[str, str] | None = None) -> FetchResult:
        self.requested.append(url)
        if url not in self.routes:
            raise AssertionError(f"FakeFetcher has no route for {url}")
        data = self.routes[url]
        content_type = "application/json" if url.endswith("json") else "application/xml"
        return FetchResult(url, data, content_type, sha256_hex(data), True)

    def post_form(self, url: str, form: dict[str, str], *, headers: dict[str, str] | None = None) -> FetchResult:
        raise AssertionError("the offline bundle never posts")


def synthetic_corpus(config: PipelineConfig, reciter_specs: list[dict[str, Any]]) -> FakeFetcher:
    """Build every route the pipeline will request for a synthetic bundle."""
    routes: dict[str, bytes] = {}
    routes[config.sources["tanzil_text"].url] = synthetic_tanzil_text_xml()
    routes[config.sources["tanzil_metadata"].url] = synthetic_tanzil_metadata_xml()

    for spec in reciter_specs:
        item_id = spec["remote_id"]
        routes[spec["license_metadata_url"]] = synthetic_ia_metadata(item_id, spec["styles_bitrates"])
        for style, timing in spec["timings"].items():
            routes[f"https://archive.org/download/{item_id}/{style}/timing.json"] = timing
    return FakeFetcher(routes=routes)


def write_synthetic_config(
    config_dir: Path,
    reciter_specs: list[dict[str, Any]],
    *,
    word_level_enabled: bool = False,
    word_timing_target: tuple[str, str] | None = None,
) -> None:
    shutil.copytree(REPO_ROOT / "content-pipeline" / "config", config_dir, dirs_exist_ok=True)

    reciters = {
        "config_version": 2,
        "catalog_policy": {"admission_rule": "test"},
        "catalog_notes": [],
        "fallback_sources": [
            {"id": "islamic_network", "name": "Islamic Network", "enabled": False, "status": "documented-fallback-off"}
        ],
        "reciters": [
            {
                "remote_id": spec["remote_id"],
                "name": spec["name"],
                "qirat": "Hafs 'an Asim",
                "source": "internet_archive",
                "enabled": True,
                "status": "test_enabled",
                "license_id": "cc-by-4.0",
                "license_url": "https://creativecommons.org/licenses/by/4.0/",
                "license_evidence_url": f"https://archive.org/details/{spec['remote_id']}",
                "license_metadata_url": spec["license_metadata_url"],
                "expected_license_url_prefix": "https://creativecommons.org/licenses/by/4.0/",
                "default_style": "murattal",
                "default_bitrate": 32,
                "styles": [
                    {
                        "id": "murattal",
                        "name": "Murattal",
                        "timing_path": "murattal/timing.json",
                        "file_extension": "m4a",
                        "bitrates": [32],
                    }
                ],
            }
            for spec in reciter_specs
        ],
    }
    (config_dir / "reciters.json").write_text(json.dumps(reciters, indent=2) + "\n", encoding="utf-8")

    word_level_config = {
        "config_version": 1,
        "enabled": word_level_enabled,
        "active_source": FIXTURE_WORD_SOURCE if word_level_enabled else None,
        "timing_target": (
            {"reciter_remote_id": word_timing_target[0], "variant": word_timing_target[1]}
            if word_timing_target
            else None
        ),
        "selection_rule": "test fixture",
        "candidates": [],
    }
    (config_dir / "word_level.json").write_text(
        json.dumps(word_level_config, indent=2) + "\n", encoding="utf-8"
    )


def make_temp_config(
    specs: list[dict[str, Any]],
    *,
    word_level_enabled: bool = False,
    word_timing_target: tuple[str, str] | None = None,
) -> tuple[tempfile.TemporaryDirectory, PipelineConfig]:
    temp = tempfile.TemporaryDirectory(prefix="ezber-test-")
    write_synthetic_config(
        Path(temp.name) / "config",
        specs,
        word_level_enabled=word_level_enabled,
        word_timing_target=word_timing_target,
    )
    config = load_config(Path(temp.name) / "config")
    return temp, config
