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
    SEGMENT_COLUMNS,
    WEB_BUNDLE_VERSION,
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

    def export(self, name: str = "web"):
        return export_web(self.build_dir, web_dir=self.root / name)

    def payload_bytes(self, web_dir: Path) -> dict[str, bytes]:
        return {
            path.relative_to(web_dir).as_posix(): path.read_bytes()
            for path in sorted(web_dir.rglob("*"))
            if path.is_file()
        }

    def test_index_inventory_covers_every_payload(self) -> None:
        result = self.export()
        index = json.loads(result.index_path.read_bytes())
        self.assertEqual(index["web_bundle_version"], WEB_BUNDLE_VERSION)
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
        self.assertEqual(index["bundle_digest"], digest_json(index["files"]))

    def test_tables_mirror_the_database(self) -> None:
        result = self.export()
        connection = sqlite3.connect(self.build_dir / "ezber-content.sqlite")
        try:
            surahs = json.loads((result.web_dir / "surahs.json").read_bytes())
            self.assertEqual(
                surahs["rows"],
                [list(row) for row in connection.execute(
                    "SELECT id, name_arabic, name_latin, name_english, verses_count, "
                    "revelation, bismillah_pre, revelation_order, rukus FROM surahs ORDER BY id"
                ).fetchall()],
            )

            ayahs = json.loads((result.web_dir / "ayahs.json").read_bytes())
            self.assertEqual(ayahs["columns"], list(AYAH_COLUMNS))
            self.assertEqual(
                ayahs["rows"][0],
                [1, 1, 1, "1:1", helpers.synthetic_ayah_text(1, 1), "transliteration 1:1", 1, 1, 1, 0, None],
            )

            words = json.loads((result.web_dir / "words.json").read_bytes())
            self.assertEqual(len(words["rows"]), 6)
            self.assertEqual(words["rows"][0][4], "first-token")

            reciters = json.loads((result.web_dir / "reciters.json").read_bytes())
            self.assertEqual(reciters["rows"][0][1], "tiny-reciter")
            self.assertEqual(reciters["rows"][0][6], "cc-by-4.0")

            audio = json.loads((result.web_dir / "audio-files.json").read_bytes())
            self.assertEqual([row[7] for row in audio["rows"]], ["https://example.org/1.m4a", "https://example.org/2.m4a"])
            self.assertEqual([row[11] for row in audio["rows"]], ["sha1:aa", "sha1:bb"])

            translations = json.loads((result.web_dir / "translations.json").read_bytes())
            self.assertEqual(translations["rows"][0][1], "19")
            transliterations = json.loads((result.web_dir / "transliterations.json").read_bytes())
            self.assertEqual(transliterations["rows"][0][1], "tanzil.en.transliteration")
        finally:
            connection.close()

    def test_segments_are_grouped_per_reciter(self) -> None:
        result = self.export()
        index = json.loads(result.index_path.read_bytes())
        segment_entries = [entry for entry in index["files"] if entry["kind"] == "segments"]
        self.assertEqual(len(segment_entries), 1)
        entry = segment_entries[0]
        self.assertEqual(entry["path"], "segments/1.json")
        self.assertEqual(entry["reciter_id"], 1)
        self.assertEqual(entry["variant"], "murattal")
        document = json.loads((result.web_dir / entry["path"]).read_bytes())
        self.assertEqual(document["reciter_id"], 1)
        self.assertEqual(document["variant"], "murattal")
        self.assertEqual(document["columns"], list(SEGMENT_COLUMNS))
        self.assertEqual(
            document["rows"],
            [[1, 0, 0, 500], [1, 1, 0, 250], [1, 2, 250, 500], [2, 0, 500, 900], [3, 0, 0, 700]],
        )

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
        self.assertIn("web bundle:", stdout.getvalue())
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

    def test_cli_export_web_missing_bundle(self) -> None:
        with redirect_stderr(io.StringIO()) as stderr:
            code = cli.main(["export-web", "--output-dir", str(self.root / "nowhere")])
        self.assertEqual(code, 2)
        self.assertIn("error:", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
