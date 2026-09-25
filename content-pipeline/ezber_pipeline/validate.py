"""Bundle validation: fail closed before anything is packaged.

Every check produces a named result; ``ensure_valid`` raises with the complete
failure list so one build surfaces every problem instead of the first.
"""

from __future__ import annotations

from dataclasses import dataclass

from .bundle import Bundle
from .config import PipelineConfig
from .errors import ValidationError


@dataclass(frozen=True)
class CheckResult:
    name: str
    ok: bool
    detail: str = ""


def _result(name: str, failures: list[str]) -> CheckResult:
    if failures:
        return CheckResult(name=name, ok=False, detail="; ".join(failures[:5]))
    return CheckResult(name=name, ok=True)


def run_checks(bundle: Bundle, config: PipelineConfig) -> list[CheckResult]:
    checks: list[CheckResult] = []

    # -- Quran structure ---------------------------------------------------
    failures: list[str] = []
    if len(bundle.surahs) != config.expected_surah_count:
        failures.append(f"{len(bundle.surahs)} surahs, expected {config.expected_surah_count}")
    if len(bundle.ayahs) != config.expected_ayah_count:
        failures.append(f"{len(bundle.ayahs)} ayahs, expected {config.expected_ayah_count}")
    expected_ids = list(range(1, len(bundle.ayahs) + 1))
    if [ayah.id for ayah in bundle.ayahs] != expected_ids:
        failures.append("ayah ids are not contiguous 1..N")
    verse_keys = [ayah.verse_key for ayah in bundle.ayahs]
    if len(set(verse_keys)) != len(verse_keys):
        failures.append("duplicate verse keys")
    for ayah in bundle.ayahs:
        if ayah.verse_key != f"{ayah.surah_id}:{ayah.ayah}":
            failures.append(f"verse_key {ayah.verse_key!r} does not match {ayah.surah_id}:{ayah.ayah}")
            break
    for surah in bundle.surahs:
        expected = f"surah {surah.id}: verses_count {surah.verses_count}"
        actual = sum(1 for ayah in bundle.ayahs if ayah.surah_id == surah.id)
        if actual != surah.verses_count:
            failures.append(f"{expected} but {actual} ayahs present")
            break
    for ayah in bundle.ayahs:
        if not ayah.text_uthmani or not ayah.text_uthmani.strip():
            failures.append(f"empty Quran text for {ayah.verse_key}")
            break
        if "\n" in ayah.text_uthmani or "\r" in ayah.text_uthmani:
            failures.append(f"newline inside Quran text for {ayah.verse_key}")
            break
    checks.append(_result("structure.counts_and_text", failures))

    # -- Metadata ranges ---------------------------------------------------
    failures = []
    previous = (0, 0, 0)
    for ayah in bundle.ayahs:
        triple = (ayah.juz or 0, ayah.hizb or 0, ayah.page or 0)
        if triple < previous:
            failures.append(f"juz/hizb/page move backwards at {ayah.verse_key}")
            break
        previous = triple
        if not (1 <= (ayah.juz or 0) <= 30 and 1 <= (ayah.hizb or 0) <= 60 and 1 <= (ayah.page or 0) <= 604):
            failures.append(f"out-of-range metadata at {ayah.verse_key}: {triple}")
            break
    sajdah_count = sum(1 for ayah in bundle.ayahs if ayah.sajdah)
    if sajdah_count != 15:
        failures.append(f"{sajdah_count} sajdah ayahs, expected 15")
    checks.append(_result("structure.metadata_ranges", failures))

    # -- Editions ----------------------------------------------------------
    failures = []
    for edition in bundle.translations:
        rows = [row for row in bundle.translation_rows if row.edition_id == edition.id]
        if len(rows) != len(bundle.ayahs):
            failures.append(f"translation {edition.resource_id}: {len(rows)} rows, expected {len(bundle.ayahs)}")
        if any(not row.text.strip() for row in rows):
            failures.append(f"translation {edition.resource_id}: empty row")
    for edition in bundle.transliterations:
        rows = [row for row in bundle.transliteration_rows if row.edition_id == edition.id]
        if len(rows) != len(bundle.ayahs):
            failures.append(
                f"transliteration {edition.resource_id}: {len(rows)} rows, expected {len(bundle.ayahs)}"
            )
        if any(not row.text.strip() for row in rows):
            failures.append(f"transliteration {edition.resource_id}: empty row")
    for row in bundle.translation_rows + bundle.transliteration_rows:
        if not (1 <= row.ayah_id <= len(bundle.ayahs)):
            failures.append(f"edition row references out-of-range ayah id {row.ayah_id}")
            break
    checks.append(_result("editions.complete", failures))

    # -- Segments ----------------------------------------------------------
    failures = []
    ayah_ids = {ayah.id for ayah in bundle.ayahs}
    seen: dict[tuple[int, str], set[int]] = {}
    for segment in bundle.segments:
        if segment.ayah_id not in ayah_ids:
            failures.append(f"segment references unknown ayah id {segment.ayah_id}")
            break
        if segment.start_ms < 0 or segment.end_ms <= segment.start_ms:
            failures.append(f"invalid segment range {segment.start_ms}..{segment.end_ms}")
            break
        key = (segment.reciter_id, segment.variant)
        seen.setdefault(key, set())
        if segment.word_index == 0:
            if segment.ayah_id in seen[key]:
                failures.append(f"duplicate whole-ayah segment for reciter {key}")
                break
            seen[key].add(segment.ayah_id)
    reciter_id_by_remote = {reciter.remote_id: reciter.id for reciter in bundle.reciters}
    for reciter_config in config.reciters:
        reciter_id = reciter_id_by_remote.get(reciter_config["remote_id"])
        if reciter_id is None:
            failures.append(f"configured reciter {reciter_config['remote_id']!r} is missing from the bundle")
            continue
        for style in reciter_config["styles"]:
            key = (reciter_id, style["id"])
            if key not in seen:
                failures.append(
                    f"reciter {reciter_config['remote_id']} style {style['id']}: no timing segments"
                )
            elif len(seen[key]) != len(bundle.ayahs):
                failures.append(
                    f"reciter {reciter_config['remote_id']} style {style['id']}: "
                    f"{len(seen[key])} ayahs with timing, expected {len(bundle.ayahs)}"
                )
    checks.append(_result("segments.coverage_and_ranges", failures))

    # -- Audio -------------------------------------------------------------
    failures = []
    grouped: dict[tuple[int, str, int], set[int]] = {}
    for audio in bundle.audio_files:
        if audio.kind != "chapter":
            failures.append(f"unexpected audio kind {audio.kind!r} in M0 bundle")
            break
        key = (audio.reciter_id, audio.variant, audio.bitrate or 0)
        grouped.setdefault(key, set())
        assert audio.chapter is not None
        grouped[key].add(audio.chapter)
        if not audio.url.startswith("https://"):
            failures.append(f"non-https audio URL {audio.url}")
            break
        if not audio.checksum:
            failures.append(f"audio missing checksum: {audio.url}")
            break
        if not audio.bytes:
            failures.append(f"audio missing size: {audio.url}")
            break
    for key, chapters in grouped.items():
        if chapters != set(range(1, config.expected_surah_count + 1)):
            failures.append(f"audio group {key} covers {len(chapters)} chapters, expected 114")
    if not bundle.audio_files:
        failures.append("no audio files in bundle")
    checks.append(_result("audio.chapter_coverage", failures))

    # -- Licenses and manifest completeness --------------------------------
    failures = []
    known_licenses = set(config.licenses)
    asset_ids = [asset.asset_id for asset in bundle.assets]
    if len(set(asset_ids)) != len(asset_ids):
        failures.append("duplicate asset ids")
    for asset in bundle.assets:
        if asset.license_id not in known_licenses:
            failures.append(f"asset {asset.asset_id} uses unknown license {asset.license_id!r}")
        if not asset.attribution.strip():
            failures.append(f"asset {asset.asset_id} has no attribution")
        if not asset.source_url.startswith("https://"):
            failures.append(f"asset {asset.asset_id} has a non-https source URL")
        if not (asset.version or asset.sha256 or asset.digest):
            failures.append(f"asset {asset.asset_id} has no version/hash")
        if not asset.license_evidence_url.startswith("https://"):
            failures.append(f"asset {asset.asset_id} has no https license evidence URL")
    for reciter in bundle.reciters:
        if reciter.license_id not in known_licenses:
            failures.append(f"reciter {reciter.remote_id} uses unknown license")
        if not reciter.attribution.strip():
            failures.append(f"reciter {reciter.remote_id} has no attribution")
    checks.append(_result("licenses.complete_and_compliant", failures))

    # -- Distribution deny-list -------------------------------------------
    failures = []
    deny_hosts = [host.lower() for host in config.policy.get("deny_hosts", [])]
    deny_fragments = [fragment.lower() for fragment in config.policy.get("deny_url_substrings", [])]
    for url in [audio.url for audio in bundle.audio_files] + [asset.source_url for asset in bundle.assets]:
        lowered = url.lower()
        if any(host in lowered for host in deny_hosts) or any(frag in lowered for frag in deny_fragments):
            failures.append(f"denied source referenced: {url}")
            break
    checks.append(_result("policy.deny_list", failures))

    return checks


def ensure_valid(bundle: Bundle, config: PipelineConfig) -> list[CheckResult]:
    checks = run_checks(bundle, config)
    failures = [f"{check.name}: {check.detail}" for check in checks if not check.ok]
    if failures:
        raise ValidationError(failures)
    return checks
