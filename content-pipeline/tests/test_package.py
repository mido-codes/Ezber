from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from ezber_pipeline.bundle import (
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
from ezber_pipeline.package import create_database
from tests import helpers


def tiny_bundle() -> Bundle:
    surahs = [
        Surah(1, "الفاتحة", "Al-Faatiha", "The Opening", 2, "Meccan", 0, 5, 1),
        Surah(2, "البقرة", "Al-Baqara", "The Cow", 1, "Medinan", 1, 87, 40),
    ]
    ayahs = [
        Ayah(1, 1, 1, "1:1", helpers.synthetic_ayah_text(1, 1), 1, 1, 1, 0, None),
        Ayah(2, 1, 2, "1:2", helpers.synthetic_ayah_text(1, 2), 1, 1, 1, 0, None),
        Ayah(3, 2, 1, "2:1", helpers.synthetic_ayah_text(2, 1), 1, 1, 2, 0, None),
    ]
    reciter = Reciter(
        id=1,
        remote_id="tiny-reciter",
        name="Tiny Reciter",
        style="Murattal",
        qirat="Hafs",
        source="internet_archive",
        license_id="cc-by-4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        license_evidence_url="https://archive.org/details/tiny",
        attribution="Tiny attribution",
        has_segments=1,
        enabled=1,
        status="candidate",
    )
    audio = [
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
    words = [
        Word(1, 1, 1, None, "bismillah", None),
        Word(2, 1, 2, None, "arrahman", None),
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
        license_evidence_url="https://example.org/fixture-license",
        attribution="Tiny translation attribution",
    )
    transliteration = Edition(
        id=57,
        kind="transliteration",
        resource_id="57",
        name="Tiny transliteration",
        author="Author",
        language="en",
        source="fixture",
        license_id="cc-by-4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        license_evidence_url="https://example.org/fixture-license",
        attribution="Tiny transliteration attribution",
    )
    translation_rows = [EditionRow(19, ayah.id, helpers.synthetic_translation(ayah.surah_id, ayah.ayah)) for ayah in ayahs]
    transliteration_rows = [
        EditionRow(57, ayah.id, helpers.synthetic_transliteration(ayah.surah_id, ayah.ayah)) for ayah in ayahs
    ]
    return Bundle(
        surahs=surahs,
        ayahs=ayahs,
        words=words,
        reciters=[reciter],
        audio_files=audio,
        segments=segments,
        translations=[translation],
        translation_rows=translation_rows,
        transliterations=[transliteration],
        transliteration_rows=transliteration_rows,
    )


class DatabasePackagingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def _create(self, name: str = "content.sqlite") -> tuple[str, str, int, str]:
        target = Path(self.temp.name) / name
        sha, size, digest = create_database(
            tiny_bundle(), helpers.REPO_ROOT / "schema" / "content_schema.sql", target
        )
        return str(target), sha, size, digest

    def test_content_database_rows_and_meta(self) -> None:
        path, sha, size, digest = self._create()
        self.assertTrue(sha.startswith("sha256:"))
        self.assertGreater(size, 0)
        self.assertTrue(digest.startswith("sha256:"))
        connection = sqlite3.connect(path)
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM surahs").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM ayahs").fetchone()[0], 3)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM audio_files").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM words").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM segments").fetchone()[0], 5)
            meta = dict(connection.execute("SELECT key, value FROM content_meta").fetchall())
            self.assertEqual(meta["logical_digest"], digest)
            self.assertEqual(meta["schema_version"], "1")
            self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        finally:
            connection.close()

    def test_rebuild_is_byte_identical(self) -> None:
        _, first_sha, _, first_digest = self._create("first.sqlite")
        _, second_sha, _, second_digest = self._create("second.sqlite")
        self.assertEqual(first_sha, second_sha)
        self.assertEqual(first_digest, second_digest)


class UserSchemaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "user.sqlite"
        self.connection = sqlite3.connect(self.path)
        self.connection.executescript(
            (helpers.REPO_ROOT / "schema" / "user_schema.sql").read_text(encoding="utf-8")
        )
        self.connection.execute("PRAGMA foreign_keys = ON")

    def tearDown(self) -> None:
        self.connection.close()

    def test_schema_version_and_fts_search(self) -> None:
        self.assertEqual(self.connection.execute("SELECT version FROM schema_version").fetchone()[0], 1)
        self.assertEqual(
            self.connection.execute("SELECT value FROM settings WHERE key = 'downloads.scope'").fetchone()[0],
            "surah",
        )
        self.connection.execute(
            "INSERT INTO presets (name, surah_id, from_ayah, to_ayah, repeat_count) VALUES ('Ar-Rahman drill', 55, 1, 5, 5)"
        )
        preset_id = self.connection.execute("SELECT last_insert_rowid()").fetchone()[0]
        self.assertEqual(
            self.connection.execute("SELECT download_scope FROM presets WHERE id = ?", (preset_id,)).fetchone()[0],
            "inherit",
        )
        self.connection.execute(
            "INSERT INTO notes (verse_key, body_md) VALUES ('55:1', 'mercy and remembrance')"
        )
        note_id = self.connection.execute("SELECT last_insert_rowid()").fetchone()[0]
        found = self.connection.execute(
            "SELECT n.id FROM notes n JOIN note_fts f ON f.rowid = n.id WHERE note_fts MATCH 'mercy'"
        ).fetchall()
        self.assertEqual(found, [(note_id,)])

        self.connection.execute("UPDATE notes SET body_md = 'sustenance' WHERE id = ?", (note_id,))
        self.assertEqual(
            self.connection.execute(
                "SELECT n.id FROM notes n JOIN note_fts f ON f.rowid = n.id WHERE note_fts MATCH 'mercy'"
            ).fetchall(),
            [],
        )
        self.assertEqual(
            self.connection.execute(
                "SELECT n.id FROM notes n JOIN note_fts f ON f.rowid = n.id WHERE note_fts MATCH 'sustenance'"
            ).fetchall(),
            [(note_id,)],
        )

        self.connection.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        self.assertEqual(
            self.connection.execute(
                "SELECT n.id FROM notes n JOIN note_fts f ON f.rowid = n.id WHERE note_fts MATCH 'sustenance'"
            ).fetchall(),
            [],
        )
        self.assertIsNotNone(preset_id)

    def test_foreign_keys_are_enforced(self) -> None:
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute(
                "INSERT INTO preset_verses (preset_id, ayah, repeat_count) VALUES (999, 1, 3)"
            )


if __name__ == "__main__":
    unittest.main()
