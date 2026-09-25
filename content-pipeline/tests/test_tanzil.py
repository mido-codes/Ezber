from __future__ import annotations

import unittest

from ezber_pipeline.errors import ValidationError
from ezber_pipeline.sources import tanzil
from tests import helpers


class TanzilTests(unittest.TestCase):
    def test_parses_uthmani_xml_verbatim(self) -> None:
        text = tanzil.parse_text_xml(helpers.synthetic_tanzil_text_xml())
        self.assertEqual(text.version, "1.1")
        self.assertEqual(len(text.surahs), 114)
        total = sum(len(surah.ayahs) for surah in text.surahs)
        self.assertEqual(total, 6236)
        self.assertEqual(text.surahs[0].ayahs[0].text, helpers.synthetic_ayah_text(1, 1))
        self.assertEqual(text.surahs[0].ayahs[0].bismillah, None)
        self.assertEqual(text.surahs[1].ayahs[0].bismillah, "بسم الله")

    def test_notice_matches_canonical_file(self) -> None:
        text = tanzil.parse_text_xml(helpers.synthetic_tanzil_text_xml())
        canonical = helpers.REPO_ROOT / "licenses" / "notices" / "tanzil-quran-text-1.1-notice.txt"
        tanzil.check_notice(text.notice, canonical)

        with self.assertRaises(ValidationError):
            tanzil.check_notice("changed terms", canonical)

    def test_parses_metadata(self) -> None:
        metadata = tanzil.parse_metadata_xml(helpers.synthetic_tanzil_metadata_xml())
        self.assertEqual(len(metadata.surahs), 114)
        self.assertEqual(len(metadata.juz_starts), 30)
        self.assertEqual(len(metadata.quarter_starts), 240)
        self.assertEqual(len(metadata.page_starts), 604)
        self.assertEqual(len(metadata.sajdas), 15)
        self.assertEqual(metadata.surahs[0].ayas, 7)

    def test_rejects_non_quran_document(self) -> None:
        with self.assertRaises(ValidationError):
            tanzil.parse_metadata_xml(b"<html></html>")


if __name__ == "__main__":
    unittest.main()
