"""Turn upstream payloads into one normalized, deterministic Bundle."""

from __future__ import annotations

from typing import Any

from . import __version__
from .bundle import (
    Asset,
    AudioFile,
    Ayah,
    Bundle,
    Edition,
    EditionRow,
    Reciter,
    Segment,
    Surah,
    Word,
)
from .canonical import digest_json, sha256_digest
from .config import REPO_ROOT, PipelineConfig
from .errors import ValidationError
from .fetch import Fetcher
from .lockfile import LockBook
from .sources import internet_archive, quran_align, tanzil, tanzil_transliteration
from .timing import map_tokens

TIMING_END_TOLERANCE_MS = 2000


def _assign_start_ranges(starts: list[tuple[int, str]], order: list[str]) -> dict[str, int]:
    """Map every verse to the last start boundary at or before it."""
    position = {verse_key: index for index, verse_key in enumerate(order)}
    unknown = [verse_key for _, verse_key in starts if verse_key not in position]
    if unknown:
        raise ValidationError([f"metadata boundary points at unknown verses: {unknown[:5]}"])
    result: dict[str, int] = {}
    pointer = 0
    current: int | None = None
    for index, verse_key in enumerate(order):
        while pointer < len(starts) and position[starts[pointer][1]] <= index:
            current = starts[pointer][0]
            pointer += 1
        if current is None:
            raise ValidationError([f"no metadata boundary for verse {verse_key}"])
        result[verse_key] = current
    return result


def _render_attribution(template: str, values: dict[str, str]) -> str:
    if "{" not in template:
        return template
    try:
        return template.format_map(values)
    except KeyError as error:
        raise ValidationError(
            [f"license attribution template needs a value for {error.args[0]!r}"]
        ) from None


def _check_denied_urls(config: PipelineConfig, urls: list[str], context: str) -> None:
    policy = config.policy
    denied_hosts = [host.lower() for host in policy.get("deny_hosts", [])]
    denied_substrings = [fragment.lower() for fragment in policy.get("deny_url_substrings", [])]
    for url in urls:
        lowered = url.lower()
        if any(host in lowered for host in denied_hosts) or any(fragment in lowered for fragment in denied_substrings):
            raise ValidationError(
                [
                    f"{context}: URL {url!r} is on the distribution deny-list "
                    f"({', '.join(denied_hosts + denied_substrings)}); refusing to catalog it"
                ]
            )


def _build_structure(
    config: PipelineConfig,
    text: tanzil.TanzilText,
    metadata: tanzil.TanzilMetadata,
) -> tuple[list[Surah], list[Ayah]]:
    if len(text.surahs) != config.expected_surah_count:
        raise ValidationError(
            [f"Tanzil text has {len(text.surahs)} surahs, expected {config.expected_surah_count}"]
        )
    if len(metadata.surahs) != len(text.surahs):
        raise ValidationError(
            [f"Tanzil metadata has {len(metadata.surahs)} surahs, text has {len(text.surahs)}"]
        )

    meta_by_index = {entry.index: entry for entry in metadata.surahs}
    order: list[str] = []
    surahs: list[Surah] = []
    raw_ayahs: list[tuple[int, tanzil.TanzilAyahRaw]] = []

    for index, text_surah in enumerate(text.surahs, start=1):
        if text_surah.index != index:
            raise ValidationError([f"Tanzil surah indexes are not contiguous at {text_surah.index}"])
        meta = meta_by_index.get(index)
        if meta is None:
            raise ValidationError([f"Tanzil metadata is missing surah {index}"])
        if meta.ayas != len(text_surah.ayahs):
            raise ValidationError(
                [
                    f"surah {index}: Tanzil metadata says {meta.ayas} ayahs, "
                    f"text has {len(text_surah.ayahs)}"
                ]
            )
        surahs.append(
            Surah(
                id=index,
                name_arabic=meta.name_arabic,
                name_latin=meta.name_latin,
                name_english=meta.name_english,
                verses_count=meta.ayas,
                revelation=meta.revelation,
                bismillah_pre=1 if text_surah.ayahs and text_surah.ayahs[0].bismillah else 0,
                revelation_order=meta.order,
                rukus=meta.rukus,
            )
        )
        for raw in text_surah.ayahs:
            order.append(f"{index}:{raw.ayah}")
            raw_ayahs.append((index, raw))

    if len(order) != config.expected_ayah_count:
        raise ValidationError([f"Tanzil text has {len(order)} ayahs, expected {config.expected_ayah_count}"])

    juz = _assign_start_ranges(metadata.juz_starts, order)
    quarters = _assign_start_ranges(metadata.quarter_starts, order)
    pages = _assign_start_ranges(metadata.page_starts, order)

    ayahs: list[Ayah] = []
    for ayah_id, (surah_id, raw) in enumerate(raw_ayahs, start=1):
        verse_key = f"{surah_id}:{raw.ayah}"
        sajdah_type = metadata.sajdas.get(verse_key)
        ayahs.append(
            Ayah(
                id=ayah_id,
                surah_id=surah_id,
                ayah=raw.ayah,
                verse_key=verse_key,
                text_uthmani=raw.text,
                juz=juz[verse_key],
                hizb=(quarters[verse_key] - 1) // 4 + 1,
                page=pages[verse_key],
                sajdah=1 if sajdah_type else 0,
                sajdah_type=sajdah_type,
            )
        )
    return surahs, ayahs


def _build_reciters(
    config: PipelineConfig,
    fetcher: Fetcher,
    lock: LockBook,
    ayah_id_by_key: dict[str, int],
    ayah_id_to_chapter: dict[int, int],
    verse_counts_by_chapter: dict[int, int],
    next_reciter_id: int = 1,
) -> tuple[list[Reciter], list[AudioFile], list[Segment], list[Asset], list[str], dict[str, int]]:
    """Audio recitations: only entries enabled after Quran Foundation confirms them in writing."""
    reciters: list[Reciter] = []
    audio_files: list[AudioFile] = []
    segments: list[Segment] = []
    assets: list[Asset] = []
    verified_urls: list[str] = []
    reciter_id_by_remote: dict[str, int] = {}

    for offset, reciter_config in enumerate(config.enabled_reciters()):
        reciter_id = next_reciter_id + offset
        remote_id = reciter_config["remote_id"]
        item, _ = internet_archive.fetch_item(
            fetcher, remote_id, reciter_config["license_metadata_url"]
        )
        internet_archive.check_license(
            item, reciter_config["expected_license_url_prefix"], f"reciter {remote_id!r}"
        )

        all_audio_facts: list[dict[str, Any]] = []
        timing_rows_total = 0
        default_style_id = reciter_config["default_style"]
        default_style_name = next(
            style["name"] for style in reciter_config["styles"] if style["id"] == default_style_id
        )

        for style in reciter_config["styles"]:
            style_id = style["id"]
            timing_path = style["timing_path"]
            timing, timing_bytes = internet_archive.fetch_timing(fetcher, remote_id, timing_path)
            lock.check_or_record(
                f"reciter:{remote_id}:timing:{style_id}",
                {
                    "url": f"{internet_archive.ARCHIVE_DOWNLOAD_BASE}/{remote_id}/{timing_path}",
                    "sha256": sha256_digest(timing_bytes),
                    "bytes": len(timing_bytes),
                    "rows": sum(len(rows) for rows in timing.values()),
                },
            )

            if sorted(timing) != list(range(1, config.expected_surah_count + 1)):
                raise ValidationError(
                    [
                        f"reciter {remote_id!r} style {style_id!r}: timing covers chapters "
                        f"{sorted(timing)[:3]}..., expected 1..{config.expected_surah_count}"
                    ]
                )

            style_segments: list[Segment] = []
            for chapter in sorted(timing):
                expected_count = verse_counts_by_chapter[chapter]
                rows = timing[chapter]
                preamble = [row for row in rows if row[0] <= 0]
                if len(preamble) > 1:
                    raise ValidationError(
                        [
                            f"reciter {remote_id!r} style {style_id!r} chapter {chapter}: "
                            f"multiple non-ayah timing rows"
                        ]
                    )
                ayah_rows = [row for row in rows if row[0] >= 1]
                if [row[0] for row in ayah_rows] != list(range(1, expected_count + 1)):
                    raise ValidationError(
                        [
                            f"reciter {remote_id!r} style {style_id!r} chapter {chapter}: "
                            f"timing ayah sequence does not match the {expected_count}-ayah surah"
                        ]
                    )
                for ayah, start_ms, end_ms in ayah_rows:
                    verse_key = f"{chapter}:{ayah}"
                    style_segments.append(
                        Segment(
                            reciter_id=reciter_id,
                            variant=style_id,
                            ayah_id=ayah_id_by_key[verse_key],
                            word_index=0,
                            start_ms=start_ms,
                            end_ms=end_ms,
                        )
                    )
            segments.extend(style_segments)
            timing_rows_total += len(style_segments)

            for bitrate in style["bitrates"]:
                facts = internet_archive.resolve_audio(
                    item,
                    style=style_id,
                    bitrate=int(bitrate),
                    extension=style["file_extension"],
                    surah_count=config.expected_surah_count,
                )
                all_audio_facts.extend(facts)
                verified_urls.extend(fact["url"] for fact in facts)
                for fact in facts:
                    chapter = int(fact["path"].rsplit("/", 1)[-1].split(".")[0])
                    audio_files.append(
                        AudioFile(
                            reciter_id=reciter_id,
                            kind="chapter",
                            surah_id=chapter,
                            ayah=None,
                            chapter=chapter,
                            variant=style_id,
                            url=fact["url"],
                            local_path=None,
                            bytes=fact.get("bytes"),
                            bitrate=int(bitrate),
                            duration_ms=fact.get("duration_ms"),
                            checksum=f"sha1:{fact['sha1']}" if fact.get("sha1") else None,
                            downloaded_at=None,
                        )
                    )
                if int(bitrate) == int(reciter_config["default_bitrate"]):
                    duration_by_chapter = {
                        int(fact["path"].rsplit("/", 1)[-1].split(".")[0]): fact.get("duration_ms")
                        for fact in facts
                    }
                    for segment in style_segments:
                        duration = duration_by_chapter.get(ayah_id_to_chapter[segment.ayah_id])
                        if duration and segment.end_ms > duration + TIMING_END_TOLERANCE_MS:
                            raise ValidationError(
                                [
                                    f"reciter {remote_id!r} style {style_id!r} ayah_id {segment.ayah_id}: "
                                    f"timing end {segment.end_ms}ms exceeds chapter duration {duration}ms"
                                ]
                            )

            assets.append(
                Asset(
                    asset_id=f"recitation-timing:{remote_id}:{style_id}",
                    kind="recitation_timing",
                    description=f"Chapter/ayah timing for {reciter_config['name']} ({style['name']})",
                    source_name="internet_archive",
                    source_url=f"{internet_archive.ARCHIVE_DOWNLOAD_BASE}/{remote_id}/{timing_path}",
                    version=item.metadata_digest,
                    sha256=sha256_digest(timing_bytes),
                    details={"item_id": remote_id, "style": style_id, "rows": len(style_segments)},
                    license_id=reciter_config["license_id"],
                    license_url=reciter_config["license_url"],
                    license_evidence_url=reciter_config["license_evidence_url"],
                    attribution=_render_attribution(
                        config.licenses[reciter_config["license_id"]]["attribution"],
                        {
                            "reciter_name": reciter_config["name"],
                            "qirat": reciter_config.get("qirat", ""),
                            "style": style["name"],
                            "item_id": remote_id,
                        },
                    ),
                )
            )

        audio_index_digest = internet_archive.file_index_digest(all_audio_facts)
        lock.check_or_record(
            f"reciter:{remote_id}:audio",
            {
                "item_id": remote_id,
                "license_url": item.license_url,
                "index_digest": audio_index_digest,
                "files": len(all_audio_facts),
            },
        )
        _check_denied_urls(config, verified_urls, f"reciter {remote_id!r}")

        attribution = _render_attribution(
            config.licenses[reciter_config["license_id"]]["attribution"],
            {
                "reciter_name": reciter_config["name"],
                "qirat": reciter_config.get("qirat", ""),
                "style": default_style_name,
                "item_id": remote_id,
            },
        )
        reciters.append(
            Reciter(
                id=reciter_id,
                remote_id=remote_id,
                name=reciter_config["name"],
                style=default_style_name,
                qirat=reciter_config.get("qirat"),
                source=reciter_config["source"],
                license_id=reciter_config["license_id"],
                license_url=reciter_config["license_url"],
                license_evidence_url=reciter_config["license_evidence_url"],
                attribution=attribution,
                has_segments=1 if timing_rows_total else 0,
                enabled=1,
                status=reciter_config.get("status", "candidate"),
            )
        )
        reciter_id_by_remote[remote_id] = reciter_id
        assets.append(
            Asset(
                asset_id=f"recitation-audio:{remote_id}",
                kind="recitation_audio",
                description=f"Chapter recitations by {reciter_config['name']} ({item.title})",
                source_name="internet_archive",
                source_url=item.download_url(""),
                version=item.metadata_digest,
                digest=audio_index_digest,
                license_id=reciter_config["license_id"],
                license_url=reciter_config["license_url"],
                license_evidence_url=reciter_config["license_evidence_url"],
                attribution=attribution,
                details={
                    "item_id": remote_id,
                    "title": item.title,
                    "styles": [style["id"] for style in reciter_config["styles"]],
                    "bitrates": {
                        style["id"]: style["bitrates"] for style in reciter_config["styles"]
                    },
                    "chapters": config.expected_surah_count,
                    "files": len(all_audio_facts),
                },
            )
        )

    return reciters, audio_files, segments, assets, verified_urls, reciter_id_by_remote


def _build_transliteration(
    config: PipelineConfig,
    fetcher: Fetcher,
    lock: LockBook,
    ayah_id_by_key: dict[str, int],
) -> tuple[Edition, list[EditionRow], Asset, tanzil_transliteration.TransliterationCorpus]:
    edition_config = config.transliteration["edition"]
    result = tanzil_transliteration.fetch_corpus(fetcher, edition_config["url"])
    lock.check_or_record(
        "tanzil_transliteration",
        {"url": edition_config["url"], "sha256": sha256_digest(result.data), "bytes": result.bytes},
    )
    corpus = tanzil_transliteration.parse_corpus(
        result.data, expected_verses=config.expected_ayah_count
    )
    tanzil_transliteration.check_provenance(
        corpus.header, REPO_ROOT / edition_config["provenance_notice_file"]
    )

    edition_id = int(edition_config.get("edition_id", 1))
    edition = Edition(
        id=edition_id,
        kind="transliteration",
        resource_id=edition_config["resource_id"],
        name=edition_config["name"],
        author=edition_config.get("author"),
        language=edition_config["language"],
        source=edition_config["source"],
        license_id=edition_config["license_id"],
        license_url=edition_config["license_url"],
        license_evidence_url=edition_config["license_evidence_url"],
        attribution=edition_config["attribution"],
    )
    rows = [
        EditionRow(edition_id=edition_id, ayah_id=ayah_id_by_key[verse_key], text=text)
        for verse_key, text in corpus.rows.items()
    ]
    rows.sort(key=lambda row: row.ayah_id)

    asset = Asset(
        asset_id=f"transliteration:{edition_config['resource_id']}",
        kind="transliteration",
        description=f"English transliteration: {edition_config['name']} ({edition_config['resource_id']})",
        source_name="tanzil",
        source_url=edition_config["url"],
        version=corpus.version,
        sha256=corpus.digest,
        bytes=len(corpus.raw),
        license_id=edition_config["license_id"],
        license_url=edition_config["license_url"],
        license_evidence_url=edition_config["license_evidence_url"],
        attribution=edition_config["attribution"],
        details={
            "resource_id": edition_config["resource_id"],
            "rows": len(rows),
            "tokens": corpus.token_count,
            "provenance_header": corpus.header.strip(),
            "written_permission": "granted (captain's records, recorded in licenses/registry.json)",
        },
    )
    return edition, rows, asset, corpus


def _build_words(
    corpus: tanzil_transliteration.TransliterationCorpus,
    ayahs: list[Ayah],
) -> tuple[list[Word], list[list[str]], dict[str, Any]]:
    """Split each transliteration line on whitespace into per-word tokens."""
    words: list[Word] = []
    tokens_by_ayah: list[list[str]] = []
    word_id = 0
    mismatch_ayahs = 0
    uthmani_word_count = 0
    for ayah in ayahs:
        tokens = corpus.rows[ayah.verse_key].split()
        uthmani_words = ayah.text_uthmani.split()
        uthmani_word_count += len(uthmani_words)
        counts_match = len(tokens) == len(uthmani_words)
        if not counts_match:
            mismatch_ayahs += 1
        for position, token in enumerate(tokens, start=1):
            word_id += 1
            words.append(
                Word(
                    id=word_id,
                    ayah_id=ayah.id,
                    position=position,
                    text_uthmani=uthmani_words[position - 1] if counts_match else None,
                    transliteration=token,
                    translation=None,
                )
            )
        tokens_by_ayah.append(tokens)
    stats = {
        "word_count": word_id,
        "uthmani_word_count": uthmani_word_count,
        "ayahs_with_token_count_mismatch": mismatch_ayahs,
    }
    return words, tokens_by_ayah, stats


def _build_timing_recitations(
    config: PipelineConfig,
    fetcher: Fetcher,
    lock: LockBook,
    ayah_id_by_key: dict[str, int],
    ayahs: list[Ayah],
    tokens_by_ayah: list[list[str]],
    next_reciter_id: int,
) -> tuple[list[Reciter], list[Segment], list[Asset], dict[str, Any]]:
    if not config.word_timing.get("enabled", False):
        return [], [], [], {}

    word_timing = config.word_timing
    archive_result = quran_align.fetch_archive(fetcher, word_timing["archive_url"])
    lock.check_or_record(
        "quran_align:archive",
        {
            "url": word_timing["archive_url"],
            "sha256": sha256_digest(archive_result.data),
            "bytes": archive_result.bytes,
        },
    )

    reciters: list[Reciter] = []
    segments: list[Segment] = []
    assets: list[Asset] = []
    recitation_facts: list[dict[str, Any]] = []

    for offset, recitation in enumerate(config.enabled_timing_recitations()):
        reciter_id = next_reciter_id + offset
        asset_name = recitation["asset"]
        asset_bytes = quran_align.read_asset(archive_result.data, asset_name)
        parsed = quran_align.parse_asset(asset_bytes, asset_name)
        lock.check_or_record(
            f"quran_align:{asset_name}",
            {
                "asset": asset_name,
                "sha256": sha256_digest(asset_bytes),
                "bytes": len(asset_bytes),
                "ayahs": len(parsed),
            },
        )

        expected_keys = {ayah.verse_key for ayah in ayahs}
        if {f"{surah}:{ayah}" for surah, ayah in parsed} != expected_keys:
            raise ValidationError(
                [
                    f"quran-align asset {asset_name!r}: ayah coverage does not match the "
                    f"{config.expected_ayah_count}-ayah Quran"
                ]
            )

        valid_time_ms = 0
        valid_words = 0
        # average word duration for the synthesis fallback
        for ayah in ayahs:
            qa_ayah = parsed[(ayah.surah_id, ayah.ayah)]
            word_count = len(ayah.text_uthmani.split())
            for segment in qa_ayah.segments:
                start, end = segment.start_ms, segment.end_ms
                if start > end:
                    start, end = end, start
                width_words = min(segment.word_end, word_count) - max(segment.word_start, 0)
                if width_words > 0 and end > start:
                    valid_time_ms += end - start
                    valid_words += width_words
        fallback_avg_ms = (valid_time_ms / valid_words) if valid_words else 600.0

        repairs = {
            "reversed_start_end": 0,
            "zero_length": 0,
            "out_of_range": 0,
            "word_overlap": 0,
            "time_inversions": 0,
            "synthesized_ayahs": 0,
        }
        for ayah in ayahs:
            qa_ayah = parsed[(ayah.surah_id, ayah.ayah)]
            tokens = tokens_by_ayah[ayah.id - 1]
            word_count = len(ayah.text_uthmani.split())
            timing = map_tokens(
                qa_ayah.segments,
                word_count=word_count,
                token_count=len(tokens),
                fallback_avg_ms=fallback_avg_ms,
                token_lengths=[len(token) for token in tokens],
            )
            for key, value in timing.repairs.items():
                repairs[key] += value
            whole_start, whole_end = timing.whole_ayah
            segments.append(
                Segment(
                    reciter_id=reciter_id,
                    variant=recitation["style_id"],
                    ayah_id=ayah.id,
                    word_index=0,
                    start_ms=whole_start,
                    end_ms=whole_end,
                )
            )
            for token_index in range(len(tokens)):
                start_ms, end_ms = timing.token_range(token_index)
                segments.append(
                    Segment(
                        reciter_id=reciter_id,
                        variant=recitation["style_id"],
                        ayah_id=ayah.id,
                        word_index=token_index + 1,
                        start_ms=start_ms,
                        end_ms=end_ms,
                    )
                )

        reciter = Reciter(
            id=reciter_id,
            remote_id=recitation["remote_id"],
            name=recitation["name"],
            style=recitation["style"],
            qirat=recitation.get("qirat"),
            source="quran_align",
            license_id=word_timing["license_id"],
            license_url=word_timing["license_url"],
            license_evidence_url=word_timing["license_evidence_url"],
            attribution=word_timing["attribution"],
            has_segments=1,
            enabled=1,
            status="timing_only",
        )
        reciters.append(reciter)
        asset = Asset(
            asset_id=f"word-timing:{recitation['remote_id']}",
            kind="word_timing",
            description=f"quran-align word timings: {recitation['name']} ({recitation['style']})",
            source_name="quran_align",
            source_url=f"{word_timing['archive_url']}#{asset_name}",
            version=word_timing.get("release_tag", "unknown"),
            sha256=sha256_digest(asset_bytes),
            license_id=word_timing["license_id"],
            license_url=word_timing["license_url"],
            license_evidence_url=word_timing["license_evidence_url"],
            attribution=word_timing["attribution"],
            details={
                "asset": asset_name,
                "release_page": word_timing.get("release_page"),
                "ayahs": len(parsed),
                "whole_ayah_segments": len(ayahs),
                "word_segments": sum(len(tokens) for tokens in tokens_by_ayah),
                "alignment_repairs": dict(repairs),
                "note": "Times are offsets within each ayah's own audio file (quran-align reference), not within a chapter file.",
            },
        )
        assets.append(asset)
        recitation_facts.append(
            {
                "remote_id": recitation["remote_id"],
                "asset": asset_name,
                "name": recitation["name"],
                "style": recitation["style"],
                "word_segments": sum(len(tokens) for tokens in tokens_by_ayah),
                "alignment_repairs": dict(repairs),
            }
        )

    excluded = [
        {
            "remote_id": recitation["remote_id"],
            "asset": recitation["asset"],
            "reason": recitation.get("excluded_reason", ""),
        }
        for recitation in word_timing.get("recitations", [])
        if recitation.get("status") == "excluded"
    ]
    stats = {
        "word_timing_source": word_timing.get("source"),
        "word_timing_release": word_timing.get("release_tag"),
        "word_timing_recitations": len(reciters),
        "word_timing_excluded": excluded,
        "word_timing_recitations_detail": recitation_facts,
    }
    return reciters, segments, assets, stats


def build_bundle(
    config: PipelineConfig,
    fetcher: Fetcher,
    lock: LockBook,
    *,
    verify_audio_sample: int = 0,
) -> Bundle:
    # -- Tanzil text and metadata -----------------------------------------
    text_source = config.sources["tanzil_text"]
    text_result = tanzil.fetch_text(fetcher, text_source.url)
    lock.check_or_record(
        "tanzil_text",
        {"url": text_source.url, "sha256": sha256_digest(text_result.data), "bytes": text_result.bytes},
    )
    text = tanzil.parse_text_xml(text_result.data)
    if text_source.notice_file:
        canonical_notice = REPO_ROOT / text_source.notice_file
        tanzil.check_notice(text.notice, canonical_notice)

    metadata_source = config.sources["tanzil_metadata"]
    metadata_result = tanzil.fetch_metadata(fetcher, metadata_source.url)
    lock.check_or_record(
        "tanzil_metadata",
        {
            "url": metadata_source.url,
            "sha256": sha256_digest(metadata_result.data),
            "bytes": metadata_result.bytes,
        },
    )
    metadata = tanzil.parse_metadata_xml(metadata_result.data)

    surahs, ayahs = _build_structure(config, text, metadata)
    ayah_id_by_key = {ayah.verse_key: ayah.id for ayah in ayahs}
    ayah_id_to_chapter = {ayah.id: ayah.surah_id for ayah in ayahs}
    verse_counts_by_chapter = {surah.id: surah.verses_count for surah in surahs}

    # -- Tanzil transliteration (written permission) -----------------------
    transliteration_edition, transliteration_rows, transliteration_asset, corpus = _build_transliteration(
        config, fetcher, lock, ayah_id_by_key
    )
    words, tokens_by_ayah, word_stats = _build_words(corpus, ayahs)

    # -- Recitations: audio only for Quran-Foundation-confirmed candidates --
    reciters, audio_files, segments, reciter_assets, verified_urls, reciter_id_by_remote = _build_reciters(
        config,
        fetcher,
        lock,
        ayah_id_by_key,
        ayah_id_to_chapter,
        verse_counts_by_chapter,
        next_reciter_id=1,
    )

    # -- quran-align word timings (CC BY 4.0) ------------------------------
    timing_reciters, timing_segments, timing_assets, timing_stats = _build_timing_recitations(
        config,
        fetcher,
        lock,
        ayah_id_by_key,
        ayahs,
        tokens_by_ayah,
        next_reciter_id=1 + len(reciters),
    )
    reciters.extend(timing_reciters)
    segments.extend(timing_segments)

    if verify_audio_sample:
        _verify_audio_sample(config, fetcher, audio_files, verify_audio_sample)

    # -- Manifest assets ---------------------------------------------------
    assets: list[Asset] = [
        Asset(
            asset_id="quran-text:tanzil-uthmani-1.1",
            kind="quran_text",
            description="Tanzil Quran Text (Uthmani, Version 1.1)",
            source_name="tanzil",
            source_url=text_source.url,
            version=text.version,
            sha256=sha256_digest(text_result.data),
            bytes=text_result.bytes,
            license_id=text_source.license_id,
            license_url=text_source.license_url,
            license_evidence_url=text_source.license_evidence_url,
            attribution=text_source.attribution,
            details={"surahs": len(surahs), "ayahs": len(ayahs)},
        ),
        Asset(
            asset_id="quran-metadata:tanzil-1.0",
            kind="quran_metadata",
            description="Tanzil Quran metadata (surah names, juz, hizb, page, sajdah)",
            source_name="tanzil",
            source_url=metadata_source.url,
            version=metadata.version,
            sha256=sha256_digest(metadata_result.data),
            bytes=metadata_result.bytes,
            license_id=metadata_source.license_id,
            license_url=metadata_source.license_url,
            license_evidence_url=metadata_source.license_evidence_url,
            attribution=metadata_source.attribution,
            details={"juz": len(metadata.juz_starts), "pages": len(metadata.page_starts)},
        ),
        transliteration_asset,
    ]
    assets.extend(reciter_assets)
    assets.extend(timing_assets)
    assets.sort(key=lambda asset: asset.asset_id)

    return Bundle(
        surahs=surahs,
        ayahs=ayahs,
        words=words,
        reciters=reciters,
        audio_files=audio_files,
        segments=segments,
        transliterations=[transliteration_edition],
        transliteration_rows=transliteration_rows,
        assets=assets,
        notices={"TANZIL-NOTICE.txt": text.notice.encode("utf-8")},
        source_facts={
            "content_mode": config.content_policy.get("mode", "offline-bundle"),
            "pipeline_version": __version__,
            "transliteration": {
                "resource_id": transliteration_edition.resource_id,
                "version": corpus.version,
                "raw_sha256": corpus.digest,
                "tokens": corpus.token_count,
                "derivation": config.transliteration["edition"].get("word_derivation", ""),
            },
            "words": word_stats,
            **timing_stats,
        },
        content_mode=config.content_policy.get("mode", "offline-bundle"),
    )


def _verify_audio_sample(
    config: PipelineConfig,
    fetcher: Fetcher,
    audio_files: list[AudioFile],
    sample_size: int,
) -> None:
    """Download a few chapter files and verify their sha1 checksums."""
    import hashlib

    candidates = [entry for entry in audio_files if entry.checksum]
    if not candidates:
        return
    step = max(1, len(candidates) // sample_size)
    for entry in candidates[::step][:sample_size]:
        result = fetcher.get(entry.url, use_cache=True)
        digest = hashlib.sha1(result.data).hexdigest()
        expected = (entry.checksum or "").split(":", 1)[-1]
        if digest != expected:
            raise ValidationError(
                [f"audio checksum mismatch for {entry.url}: expected {expected}, got {digest}"]
            )
