from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ezber_pipeline.errors import ValidationError
from ezber_pipeline.sources import tanzil_transliteration
from tests import helpers


class TanzilTransliterationTests(unittest.TestCase):
    def test_parses_and_strips_presentation_markup(self) -> None:
        corpus = tanzil_transliteration.parse_corpus(
            helpers.synthetic_transliteration_page(), expected_verses=6236
        )
        self.assertEqual(len(corpus.rows), 6236)
        self.assertEqual(corpus.version, "September 6, 2010")
        first = corpus.rows["1:1"]
        self.assertNotIn("<", first)
        self.assertTrue(first.startswith("word1-1-0"))
        self.assertIn("extra2-21", corpus.rows["2:21"])

    def test_provenance_header_matches_committed_notice(self) -> None:
        corpus = tanzil_transliteration.parse_corpus(
            helpers.synthetic_transliteration_page(), expected_verses=6236
        )
        canonical = helpers.REPO_ROOT / "licenses" / "notices" / "tanzil-transliteration-en.transliteration.txt"
        tanzil_transliteration.check_provenance(corpus.header, canonical)

        with tempfile.TemporaryDirectory() as temp:
            wrong = Path(temp) / "notice.txt"
            wrong.write_text("changed header\n", encoding="utf-8")
            with self.assertRaises(ValidationError):
                tanzil_transliteration.check_provenance(corpus.header, wrong)

    def test_missing_verses_fail(self) -> None:
        with self.assertRaises(ValidationError):
            tanzil_transliteration.parse_corpus(b"1|1|only one\n", expected_verses=6236)

    def test_missing_header_fails(self) -> None:
        lines = b"\n".join(
            f"{surah}|{ayah}|line".encode() for surah, count in helpers.verse_counts().items() for ayah in range(1, count + 1)
        )
        with self.assertRaises(ValidationError):
            tanzil_transliteration.parse_corpus(lines, expected_verses=6236)


if __name__ == "__main__":
    unittest.main()
