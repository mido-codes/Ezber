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
from .sources import internet_archive, tanzil, word_level

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
) -> tuple[list[Reciter], list[AudioFile], list[Segment], list[Asset], list[str], dict[str, int]]:
    reciters: list[Reciter] = []
    audio_files: list[AudioFile] = []
    segments: list[Segment] = []
    assets: list[Asset] = []
    verified_urls: list[str] = []
    reciter_id_by_remote: dict[str, int] = {}

    for index, reciter_config in enumerate(config.enabled_reciters(), start=1):
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
                            reciter_id=index,
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
                            reciter_id=index,
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
                id=index,
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
        reciter_id_by_remote[remote_id] = index
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


def _build_word_level(
    config: PipelineConfig,
    fetcher: Fetcher,
    ayah_id_by_key: dict[str, int],
    verse_counts_by_chapter: dict[int, int],
    reciter_id_by_remote: dict[str, int],
) -> tuple[list[Word], list[Segment], list[Edition], list[EditionRow], list[Asset], dict[str, Any]]:
    adapter = word_level.resolve_adapter(config.word_level)
    if adapter is None:
        return [], [], [], [], [], {}

    data = adapter.fetch(fetcher, verse_counts=verse_counts_by_chapter)
    if data.license_id not in config.licenses:
        raise ValidationError(
            [f"word-level source {data.source_id!r} references unknown license {data.license_id!r}"]
        )
    if not data.attribution.strip():
        raise ValidationError([f"word-level source {data.source_id!r} has no attribution"])
    if data.timing_target is None and data.timings:
        raise ValidationError([f"word-level source {data.source_id!r} returned timings without a timing_target"])

    tokens_by_verse: dict[str, list[word_level.WordToken]] = {}
    for token in data.words:
        verse_key = f"{token.surah}:{token.ayah}"
        if verse_key not in ayah_id_by_key:
            raise ValidationError(
                [f"word-level source {data.source_id!r} returned an unknown verse {verse_key}"]
            )
        tokens_by_verse.setdefault(verse_key, []).append(token)

    words: list[Word] = []
    word_id = 0
    for surah, count in sorted(verse_counts_by_chapter.items()):
        for ayah in range(1, count + 1):
            verse_key = f"{surah}:{ayah}"
            tokens = sorted(tokens_by_verse.get(verse_key, []), key=lambda token: token.position)
            if [token.position for token in tokens] != list(range(1, len(tokens) + 1)):
                raise ValidationError(
                    [
                        f"word-level source {data.source_id!r}: words for {verse_key} are missing "
                        "or not contiguous from position 1"
                    ]
                )
            for token in tokens:
                if not token.transliteration.strip():
                    raise ValidationError(
                        [f"word-level source {data.source_id!r}: empty transliteration at {verse_key} word {token.position}"]
                    )
                word_id += 1
                words.append(
                    Word(
                        id=word_id,
                        ayah_id=ayah_id_by_key[verse_key],
                        position=token.position,
                        text_uthmani=token.text_uthmani,
                        transliteration=token.transliteration,
                        translation=token.translation,
                    )
                )

    word_segments: list[Segment] = []
    if data.timing_target is not None:
        reciter_id = reciter_id_by_remote.get(data.timing_target.reciter_remote_id)
        if reciter_id is None:
            raise ValidationError(
                [
                    f"word-level timing target reciter {data.timing_target.reciter_remote_id!r} "
                    "is not an enabled reciter in this bundle"
                ]
            )
        reciter_config = next(
            reciter
            for reciter in config.enabled_reciters()
            if reciter["remote_id"] == data.timing_target.reciter_remote_id
        )
        valid_variants = {style["id"] for style in reciter_config["styles"]}
        if data.timing_target.variant not in valid_variants:
            raise ValidationError(
                [
                    f"word-level timing variant {data.timing_target.variant!r} is not a style "
                    f"of reciter {data.timing_target.reciter_remote_id!r}"
                ]
            )
        timing_by_verse: dict[str, dict[int, word_level.WordTiming]] = {}
        for timing in data.timings:
            timing_by_verse.setdefault(f"{timing.surah}:{timing.ayah}", {})[timing.position] = timing
        for surah, count in sorted(verse_counts_by_chapter.items()):
            for ayah in range(1, count + 1):
                verse_key = f"{surah}:{ayah}"
                tokens = sorted(tokens_by_verse.get(verse_key, []), key=lambda token: token.position)
                previous_end = None
                for token in tokens:
                    timing = timing_by_verse.get(verse_key, {}).get(token.position)
                    if timing is None:
                        raise ValidationError(
                            [
                                f"word-level source {data.source_id!r}: missing timing for "
                                f"{verse_key} word {token.position}"
                            ]
                        )
                    if timing.start_ms < 0 or timing.end_ms <= timing.start_ms:
                        raise ValidationError(
                            [f"word-level source {data.source_id!r}: invalid range at {verse_key} word {token.position}"]
                        )
                    if previous_end is not None and timing.start_ms < previous_end:
                        raise ValidationError(
                            [
                                f"word-level source {data.source_id!r}: overlapping word timings at "
                                f"{verse_key} word {token.position}"
                            ]
                        )
                    previous_end = timing.end_ms
                    word_segments.append(
                        Segment(
                            reciter_id=reciter_id,
                            variant=data.timing_target.variant,
                            ayah_id=ayah_id_by_key[verse_key],
                            word_index=token.position,
                            start_ms=timing.start_ms,
                            end_ms=timing.end_ms,
                        )
                    )

    edition_id = int(config.word_level.get("edition_id", 1))
    transliteration_rows: list[EditionRow] = []
    explicit = data.ayah_transliteration or {}
    for surah, count in sorted(verse_counts_by_chapter.items()):
        for ayah in range(1, count + 1):
            verse_key = f"{surah}:{ayah}"
            text = explicit.get(verse_key)
            if text is None:
                tokens = sorted(tokens_by_verse.get(verse_key, []), key=lambda token: token.position)
                text = " ".join(token.transliteration for token in tokens)
            if not text.strip():
                raise ValidationError(
                    [f"word-level source {data.source_id!r}: empty transliteration line for {verse_key}"]
                )
            transliteration_rows.append(
                EditionRow(edition_id=edition_id, ayah_id=ayah_id_by_key[verse_key], text=text)
            )

    edition = Edition(
        id=edition_id,
        kind="transliteration",
        resource_id=data.source_id,
        name=data.name,
        author=None,
        language=data.language,
        source="word_level_adapter",
        license_id=data.license_id,
        license_url=data.license_url,
        license_evidence_url=data.license_evidence_url,
        attribution=data.attribution,
    )

    digest = digest_json(
        {
            "words": [
                [word.ayah_id, word.position, word.text_uthmani, word.transliteration, word.translation]
                for word in words
            ],
            "timings": [
                [segment.ayah_id, segment.word_index, segment.start_ms, segment.end_ms]
                for segment in word_segments
            ],
        }
    )
    asset = Asset(
        asset_id=f"word-transliteration:{data.source_id}",
        kind="word_transliteration",
        description=(
            f"Word-level transliteration and timing: {data.name} ({data.license_id})"
        ),
        source_name="configured_adapter",
        source_url=data.license_evidence_url,
        version=data.source_id,
        digest=digest,
        license_id=data.license_id,
        license_url=data.license_url,
        license_evidence_url=data.license_evidence_url,
        attribution=data.attribution,
        details={
            "source_id": data.source_id,
            "words": len(words),
            "word_segments": len(word_segments),
            "ayahs": len(transliteration_rows),
            "timing_target": (
                {
                    "reciter_remote_id": data.timing_target.reciter_remote_id,
                    "variant": data.timing_target.variant,
                }
                if data.timing_target
                else None
            ),
        },
    )
    source_fact = {
        "word_level_source": data.source_id,
        "word_count": len(words),
        "word_segment_count": len(word_segments),
    }
    return words, word_segments, [edition], transliteration_rows, [asset], source_fact


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

    # -- Recitations (only explicitly enabled, rights-cleared candidates) --
    reciters, audio_files, segments, reciter_assets, verified_urls, reciter_id_by_remote = _build_reciters(
        config, fetcher, lock, ayah_id_by_key, ayah_id_to_chapter, verse_counts_by_chapter
    )

    # -- Word-level transliteration and timing adapter ---------------------
    words, word_segments, transliterations, transliteration_rows, word_assets, word_source_facts = _build_word_level(
        config, fetcher, ayah_id_by_key, verse_counts_by_chapter, reciter_id_by_remote
    )
    segments.extend(word_segments)

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
    ]
    assets.extend(reciter_assets)
    assets.extend(word_assets)
    assets.sort(key=lambda asset: asset.asset_id)

    return Bundle(
        surahs=surahs,
        ayahs=ayahs,
        words=words,
        reciters=reciters,
        audio_files=audio_files,
        segments=segments,
        transliterations=transliterations,
        transliteration_rows=transliteration_rows,
        assets=assets,
        notices={"TANZIL-NOTICE.txt": text.notice.encode("utf-8")},
        source_facts={
            "content_mode": config.content_policy.get("mode", "offline-bundle"),
            "pipeline_version": __version__,
            **word_source_facts,
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
