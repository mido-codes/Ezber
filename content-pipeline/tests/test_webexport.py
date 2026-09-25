from __future__ import annotations

import io
import json
import os
import shutil
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from ezber_pipeline import cli
from ezber_pipeline.bundle import (
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
from ezber_pipeline.canonical import canonical_json_bytes, digest_json, sha256_digest
from ezber_pipeline.config import CONTENT_SCHEMA_PATH
from ezber_pipeline.errors import PipelineError
from ezber_pipeline.package import build_content_manifest, create_database
from ezber_pipeline.webexport import (
    AYAH_COLUMNS,
    LAYOUT_GROUPED,
    LAYOUT_SINGLE,
    RECITER_COLUMNS,
    SEGMENT_COLUMNS,
    SINGLE_WEB_BUNDLE_VERSION,
    SURAH_COLUMNS,
    TRANSLITERATION_ROW_COLUMNS,
    WEB_BUNDLE_VERSION,
    WORD_COLUMNS,
    export_web,
)
from tests import helpers


def tiny_bundle() -> Bundle:
    """A small but complete bundle that touches every exported table."""
    surahs = [
        Surah(1, "الفاتحة", "Al-Faatiha", "The Opening", 2, "Meccan", 0, 5, 1),
        Surah(2, "البقرة", "Al-Baqara", "The Cow", 1, "Medinan", 1, 87, 40),
    ]
    ayahs = [
        Ayah(1, 1, 1, "1:1", helpers.synthetic_ayah_text(1, 1), 1, 1, 1, 0, None),
        Ayah(2, 1, 2, "1:2", helpers.synthetic_ayah_text(1, 2), 1, 1, 1, 0, None),
        Ayah(3, 2, 1, "2:1", helpers.synthetic_ayah_text(2, 1), 1, 1, 2, 0, None),
    ]
    words = [
        Word(1, 1, 1, "كلمة1", "first-token", None),
        Word(2, 1, 2, None, "second-token", None),
        Word(3, 2, 1, "كلمة2", "third-token", None),
        Word(4, 2, 2, "كلمة3", "fourth-token", None),
        Word(5, 3, 1, "كلمة4", "fifth-token", None),
        Word(6, 3, 2, "كلمة5", "sixth-token", None),
    ]
    reciter = Reciter(
        id=1,
        remote_id="tiny-reciter",
        name="Tiny Reciter",
        style="Murattal",
        qirat="Hafs 'an Asim",
        source="internet_archive",
        license_id="cc-by-4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        license_evidence_url="https://archive.org/details/tiny",
        attribution="Tiny recitation attribution",
        has_segments=1,
        enabled=1,
        status="candidate",
    )
    audio_files = [
        AudioFile(1, "chapter", 1, None, 1, "murattal", "https://example.org/1.m4a", None, 10, 32, 1000, "sha1:aa", None),
        AudioFile(1, "chapter", 2, None, 2, "murattal", "https://example.org/2.m4a", None, 10, 32, 1000, "sha1:bb", None),
    ]
    segments = [
        Segment(1, "murattal", 1, 0, 0, 500),
        Segment(1, "murattal", 1, 1, 0, 250),
        Segment(1, "murattal", 1, 2, 250, 500),
        Segment(1, "murattal", 2, 0, 500, 900),
        Segment(1, "murattal", 3, 0, 0, 700),
    ]
    translation = Edition(
        id=19,
        kind="translation",
        resource_id="19",
        name="Tiny translation",
        author="Author",
        language="en",
        source="fixture",
        license_id="cc-by-3.0",
        license_url="https://creativecommons.org/licenses/by/3.0/",
        license_evidence_url="https://example.org/translation-license",
        attribution="Tiny translation attribution",
    )
    transliteration = Edition(
        id=57,
        kind="transliteration",
        resource_id="tanzil.en.transliteration",
        name="Tiny transliteration",
        author="Tanzil Project",
        language="en",
        source="tanzil",
        license_id="tanzil-transliteration-permission",
        license_url="https://tanzil.net/trans/",
        license_evidence_url="https://tanzil.net/trans/en.transliteration",
        attribution="Tiny transliteration attribution",
    )
    transliteration_rows = [
        EditionRow(57, ayah.id, f"transliteration {ayah.verse_key}") for ayah in ayahs
    ]
    translation_rows = [
        EditionRow(19, ayah.id, helpers.synthetic_translation(ayah.surah_id, ayah.ayah)) for ayah in ayahs
    ]
    assets = [
        Asset(
            asset_id="quran-text:tiny",
            kind="quran_text",
            description="Tiny Quran text",
            source_name="tanzil",
            source_url="https://tanzil.net/pub/download/index.php",
            license_id="cc-by-3.0",
            license_url="https://creativecommons.org/licenses/by/3.0/",
            license_evidence_url="https://tanzil.net/docs/Text_License",
            attribution="Tiny Quran text attribution",
            sha256="sha256:" + "0" * 64,
            bytes=10,
        ),
        Asset(
            asset_id="recitation-audio:tiny-reciter",
            kind="recitation_audio",
            description="Tiny recitation",
            source_name="internet_archive",
            source_url="https://archive.org/details/tiny",
            license_id="cc-by-4.0",
            license_url="https://creativecommons.org/licenses/by/4.0/",
            license_evidence_url="https://archive.org/details/tiny",
            attribution="Tiny recitation attribution",
            digest="sha256:" + "1" * 64,
        ),
        Asset(
            asset_id="transliteration:tanzil.en.transliteration",
            kind="transliteration",
            description="Tiny transliteration",
            source_name="tanzil",
            source_url="https://tanzil.net/trans/en.transliteration",
            license_id="tanzil-transliteration-permission",
            license_url="https://tanzil.net/trans/",
            license_evidence_url="https://tanzil.net/trans/en.transliteration",
            attribution="Tiny transliteration attribution",
            sha256="sha256:" + "2" * 64,
        ),
    ]
    return Bundle(
        surahs=surahs,
        ayahs=ayahs,
        words=words,
        reciters=[reciter],
        audio_files=audio_files,
        segments=segments,
        translations=[translation],
        translation_rows=translation_rows,
        transliterations=[transliteration],
        transliteration_rows=transliteration_rows,
        assets=assets,
        content_mode="offline-redistributable",
    )


class WebExportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="ezber-web-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.build_dir = self.root / "build"
        self.build_dir.mkdir()
        self.config_temp, self.config = helpers.make_temp_config([])
        self.addCleanup(self.config_temp.cleanup)

        self.bundle = tiny_bundle()
        database_path = self.build_dir / "ezber-content.sqlite"
        sha256, size, logical_digest = create_database(self.bundle, CONTENT_SCHEMA_PATH, database_path)
        self.database_info = {
            "file": "ezber-content.sqlite",
            "sha256": sha256,
            "bytes": size,
            "logical_digest": logical_digest,
        }
        manifest = build_content_manifest(self.bundle, self.config, self.database_info)
        (self.build_dir / "content-manifest.json").write_bytes(canonical_json_bytes(manifest))
        (self.build_dir / "TANZIL-NOTICE.txt").write_bytes(b"Tanzil notice fixture\n")

    def export(self, name: str = "web", **kwargs):
        return export_web(self.build_dir, web_dir=self.root / name, **kwargs)

    def payload_bytes(self, web_dir: Path) -> dict[str, bytes]:
        return {
            path.relative_to(web_dir).as_posix(): path.read_bytes()
            for path in sorted(web_dir.rglob("*"))
            if path.is_file()
        }

    def assert_inventory_covers_every_payload(self, result) -> None:
        """Every emitted file except index.json is listed with a real digest."""
        index = json.loads(result.index_path.read_bytes())
        listed = {entry["path"]: entry for entry in index["files"]}
        actual = {
            path.relative_to(result.web_dir).as_posix()
            for path in result.web_dir.rglob("*")
            if path.is_file() and path != result.index_path
        }
        self.assertEqual(set(listed), actual)
        for path, entry in listed.items():
            data = (result.web_dir / path).read_bytes()
            self.assertEqual(entry["sha256"], sha256_digest(data), path)
            self.assertEqual(entry["bytes"], len(data), path)
            self.assertTrue(data.endswith(b"\n"), path)
            if path.endswith(".json"):
                self.assertEqual(data, canonical_json_bytes(json.loads(data), indent=None), path)
        expected_digest = {key: value for key, value in index.items() if key != "bundle_digest"}
        self.assertEqual(index["bundle_digest"], digest_json(expected_digest))

    def test_grouped_index_carries_the_catalogue_without_verse_text(self) -> None:
        result = self.export()
        self.assertEqual(result.layout, LAYOUT_GROUPED)
        index_bytes = result.index_path.read_bytes()
        self.assertTrue(index_bytes.endswith(b"\n"))
        self.assertEqual(index_bytes, canonical_json_bytes(json.loads(index_bytes), indent=None))
        index = json.loads(index_bytes)

        self.assertEqual(index["web_bundle_version"], WEB_BUNDLE_VERSION)
        self.assertEqual(index["layout"], LAYOUT_GROUPED)
        self.assertEqual(
            index["counts"],
            {
                "surahs": 2,
                "ayahs": 3,
                "words": 6,
                "reciters": 1,
                "audio_files": 2,
                "segments": 5,
                "translations": 1,
                "transliterations": 1,
            },
        )
        self.assertEqual(index["logical_digest"], self.database_info["logical_digest"])
        self.assertEqual(index["database"], self.database_info)
        self.assertEqual(index["schema_sha256"], sha256_digest(CONTENT_SCHEMA_PATH.read_bytes()))
        self.assertEqual(index["content_mode"], "offline-redistributable")
        self.assertEqual(index["meta"]["schema_version"], "1")
        self.assertEqual(index["licenses_file"], "licenses.json")

        # The surah summary and the reciter catalogue are inline, so booting the
        # app needs no extra request.
        self.assertEqual(index["surahs"]["columns"], list(SURAH_COLUMNS))
        self.assertEqual([row[0] for row in index["surahs"]["rows"]], [1, 2])
        self.assertEqual([row[4] for row in index["surahs"]["rows"]], [2, 1])
        self.assertEqual(index["reciters"]["columns"], list(RECITER_COLUMNS))
        self.assertEqual(index["reciters"]["rows"][0][1], "tiny-reciter")

        # No verse text and no timings in the eager index.
        self.assertNotIn(b"text_uthmani", index_bytes)
        self.assertNotIn(b"start_ms", index_bytes)
        self.assertNotIn(helpers.synthetic_ayah_text(1, 1).encode("utf-8"), index_bytes)

        self.assert_inventory_covers_every_payload(result)

    def test_surah_files_group_ayahs_words_and_transliteration_rows(self) -> None:
        result = self.export()
        index = json.loads(result.index_path.read_bytes())
        surah_entries = {entry["surah_id"]: entry for entry in index["files"] if entry["kind"] == "surah"}
        self.assertEqual(set(surah_entries), {1, 2})
        self.assertEqual(surah_entries[1]["path"], "surahs/1.json")
        self.assertEqual(surah_entries[1]["ayahs"], 2)
        self.assertEqual(surah_entries[1]["words"], 4)

        first = json.loads((result.web_dir / "surahs/1.json").read_bytes())
        self.assertEqual(first["surah_id"], 1)
        self.assertEqual(first["ayahs"]["columns"], list(AYAH_COLUMNS))
        self.assertEqual(
            first["ayahs"]["rows"],
            [
                [1, 1, 1, "1:1", helpers.synthetic_ayah_text(1, 1), "transliteration 1:1", 1, 1, 1, 0, None],
                [2, 1, 2, "1:2", helpers.synthetic_ayah_text(1, 2), "transliteration 1:2", 1, 1, 1, 0, None],
            ],
        )
        self.assertEqual(first["transliteration_rows"]["columns"], list(TRANSLITERATION_ROW_COLUMNS))
        self.assertEqual(
            first["transliteration_rows"]["rows"],
            [[57, 1, "transliteration 1:1"], [57, 2, "transliteration 1:2"]],
        )
        self.assertEqual(first["words"]["columns"], list(WORD_COLUMNS))
        self.assertEqual([row[0] for row in first["words"]["rows"]], [1, 2, 3, 4])
        self.assertEqual([row[1] for row in first["words"]["rows"]], [1, 1, 2, 2])
        self.assertEqual(first["words"]["rows"][0][4], "first-token")

        second = json.loads((result.web_dir / "surahs/2.json").read_bytes())
        self.assertEqual(second["surah_id"], 2)
        self.assertEqual([row[0] for row in second["ayahs"]["rows"]], [3])
        self.assertEqual([row[1] for row in second["words"]["rows"]], [3, 3])
        self.assertEqual([row[1] for row in second["transliteration_rows"]["rows"]], [3])

    def test_segments_are_grouped_per_reciter_and_surah(self) -> None:
        result = self.export()
        index = json.loads(result.index_path.read_bytes())
        segment_entries = [entry for entry in index["files"] if entry["kind"] == "segments"]
        self.assertEqual([entry["path"] for entry in segment_entries], ["segments/1/1.json", "segments/1/2.json"])
        self.assertEqual([entry["reciter_id"] for entry in segment_entries], [1, 1])
        self.assertEqual([entry["surah_id"] for entry in segment_entries], [1, 2])
        self.assertEqual([entry["variant"] for entry in segment_entries], ["murattal", "murattal"])
        self.assertEqual([entry["rows"] for entry in segment_entries], [4, 1])

        first = json.loads((result.web_dir / "segments/1/1.json").read_bytes())
        self.assertEqual(first["reciter_id"], 1)
        self.assertEqual(first["variant"], "murattal")
        self.assertEqual(first["surah_id"], 1)
        self.assertEqual(first["columns"], list(SEGMENT_COLUMNS))
        self.assertEqual(
            first["rows"],
            [[1, 0, 0, 500], [1, 1, 0, 250], [1, 2, 250, 500], [2, 0, 500, 900]],
        )
        second = json.loads((result.web_dir / "segments/1/2.json").read_bytes())
        self.assertEqual(second["surah_id"], 2)
        self.assertEqual(second["rows"], [[3, 0, 0, 700]])

    def test_catalogue_files_mirror_the_database(self) -> None:
        result = self.export()
        connection = sqlite3.connect(self.build_dir / "ezber-content.sqlite")
        try:
            audio = json.loads((result.web_dir / "audio-files.json").read_bytes())
            self.assertEqual(
                [row[7] for row in audio["rows"]],
                ["https://example.org/1.m4a", "https://example.org/2.m4a"],
            )
            self.assertEqual([row[11] for row in audio["rows"]], ["sha1:aa", "sha1:bb"])

            translations = json.loads((result.web_dir / "translations.json").read_bytes())
            self.assertEqual(translations["rows"][0][1], "19")
            transliterations = json.loads((result.web_dir / "transliterations.json").read_bytes())
            self.assertEqual(transliterations["rows"][0][1], "tanzil.en.transliteration")

            expected_surahs = connection.execute(
                "SELECT id, name_arabic, name_latin, name_english, verses_count, "
                "revelation, bismillah_pre, revelation_order, rukus FROM surahs ORDER BY id"
            ).fetchall()
            index = json.loads(result.index_path.read_bytes())
            self.assertEqual(
                index["surahs"]["rows"],
                [list(row) for row in expected_surahs],
            )
        finally:
            connection.close()

    def test_licenses_attributions_and_notice_are_attached(self) -> None:
        result = self.export()
        licenses = json.loads((result.web_dir / "licenses.json").read_bytes())
        self.assertEqual(
            [entry["id"] for entry in licenses["licenses"]],
            ["cc-by-3.0", "cc-by-4.0", "tanzil-transliteration-permission"],
        )
        for entry in licenses["licenses"]:
            self.assertTrue(entry["attribution"])
            self.assertIn("obligations", entry)
        texts = [entry["text"] for entry in licenses["attributions"]]
        self.assertIn("Tiny Quran text attribution", texts)
        self.assertIn("Tiny recitation attribution", texts)
        self.assertIn("Tiny transliteration attribution", texts)
        self.assertIn("Tiny translation attribution", texts)
        notice = (result.web_dir / "TANZIL-NOTICE.txt").read_bytes()
        self.assertEqual(notice, b"Tanzil notice fixture\n")
        self.assertEqual(licenses["notices"][0]["sha256"], sha256_digest(notice))
        self.assertEqual(licenses["notices"][0]["path"], "TANZIL-NOTICE.txt")

    def test_single_layout_remains_available(self) -> None:
        result = self.export("web-single", layout=LAYOUT_SINGLE)
        self.assertEqual(result.layout, LAYOUT_SINGLE)
        index = json.loads(result.index_path.read_bytes())
        self.assertEqual(index["web_bundle_version"], SINGLE_WEB_BUNDLE_VERSION)
        self.assertEqual(index["layout"], LAYOUT_SINGLE)
        for name in ("surahs.json", "ayahs.json", "words.json", "reciters.json", "segments/1.json"):
            self.assertTrue((result.web_dir / name).exists(), name)
        document = json.loads((result.web_dir / "segments/1.json").read_bytes())
        self.assertEqual(document["reciter_id"], 1)
        self.assertEqual(document["variant"], "murattal")
        self.assertEqual(
            document["rows"],
            [[1, 0, 0, 500], [1, 1, 0, 250], [1, 2, 250, 500], [2, 0, 500, 900], [3, 0, 0, 700]],
        )
        self.assert_inventory_covers_every_payload(result)

    def test_unknown_layout_is_rejected(self) -> None:
        with self.assertRaises(PipelineError):
            self.export(layout="bogus")

    def test_export_is_byte_deterministic_and_repeatable(self) -> None:
        first = self.export("web-first")
        first_bytes = self.payload_bytes(first.web_dir)
        second = self.export("web-second")
        self.assertEqual(first_bytes, self.payload_bytes(second.web_dir))

        # Exporting over an existing bundle replaces it without touching siblings.
        again = export_web(self.build_dir, web_dir=first.web_dir)
        self.assertEqual(first_bytes, self.payload_bytes(again.web_dir))
        self.assertFalse((first.web_dir.parent / f".{first.web_dir.name}.tmp-{os.getpid()}").exists())

    def test_refuses_foreign_directory(self) -> None:
        foreign = self.root / "web"
        foreign.mkdir()
        (foreign / "keep.txt").write_text("not a bundle\n", encoding="utf-8")
        with self.assertRaises(PipelineError):
            export_web(self.build_dir, web_dir=foreign)
        self.assertTrue((foreign / "keep.txt").exists())

    def test_missing_artifacts_fail_cleanly(self) -> None:
        with self.assertRaises(PipelineError):
            export_web(self.root / "nowhere")

        missing_database = self.root / "missing-database"
        missing_database.mkdir()
        shutil.copy(self.build_dir / "content-manifest.json", missing_database / "content-manifest.json")
        with self.assertRaises(PipelineError):
            export_web(missing_database)

        tampered = self.root / "tampered"
        tampered.mkdir()
        manifest = json.loads((self.build_dir / "content-manifest.json").read_bytes())
        manifest["bundle"]["database"]["sha256"] = "sha256:" + "0" * 64
        (tampered / "content-manifest.json").write_bytes(canonical_json_bytes(manifest))
        shutil.copy(self.build_dir / "ezber-content.sqlite", tampered / "ezber-content.sqlite")
        shutil.copy(self.build_dir / "TANZIL-NOTICE.txt", tampered / "TANZIL-NOTICE.txt")
        with self.assertRaises(PipelineError):
            export_web(tampered)

    def test_cli_export_web(self) -> None:
        with redirect_stdout(io.StringIO()) as stdout:
            code = cli.main(["export-web", "--output-dir", str(self.build_dir)])
        self.assertEqual(code, 0)
        self.assertTrue((self.build_dir / "web" / "index.json").exists())
        self.assertTrue((self.build_dir / "web" / "surahs" / "1.json").exists())
        self.assertIn("web bundle:", stdout.getvalue())
        self.assertIn("layout:        grouped", stdout.getvalue())
        self.assertIn("bundle digest:", stdout.getvalue())

        with redirect_stdout(io.StringIO()) as stdout:
            code = cli.main(
                [
                    "export-web",
                    "--output-dir",
                    str(self.build_dir),
                    "--web-dir",
                    str(self.root / "custom-web"),
                ]
            )
        self.assertEqual(code, 0)
        self.assertTrue((self.root / "custom-web" / "index.json").exists())

        with redirect_stdout(io.StringIO()):
            code = cli.main(
                [
                    "export-web",
                    "--output-dir",
                    str(self.build_dir),
                    "--web-dir",
                    str(self.root / "legacy-web"),
                    "--layout",
                    "single",
                ]
            )
        self.assertEqual(code, 0)
        self.assertTrue((self.root / "legacy-web" / "ayahs.json").exists())

    def test_cli_export_web_missing_bundle(self) -> None:
        with redirect_stderr(io.StringIO()) as stderr:
            code = cli.main(["export-web", "--output-dir", str(self.root / "nowhere")])
        self.assertEqual(code, 2)
        self.assertIn("error:", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
