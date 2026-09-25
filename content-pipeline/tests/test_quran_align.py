from __future__ import annotations

import json
import unittest

from ezber_pipeline.errors import FetchError, ValidationError
from ezber_pipeline.sources import quran_align
from tests import helpers


class QuranAlignTests(unittest.TestCase):
    def test_reads_named_asset_from_archive(self) -> None:
        archive = helpers.synthetic_quran_align_archive()
        data = quran_align.read_asset(archive, "Fake_Alafasy_128kbps.json")
        ayat = quran_align.parse_asset(data, "Fake_Alafasy_128kbps.json")
        self.assertEqual(len(ayat), 6236)
        first = ayat[(1, 1)]
        self.assertEqual(len(first.segments), len(helpers.synthetic_uthmani_words(1, 1)))

    def test_missing_asset_fails(self) -> None:
        with self.assertRaises(FetchError):
            quran_align.read_asset(helpers.synthetic_quran_align_archive(), "nope.json")

    def test_malformed_json_fails(self) -> None:
        with self.assertRaises(FetchError):
            quran_align.parse_asset(b"not json", "broken.json")

    def test_missing_segments_key_becomes_empty(self) -> None:
        payload = json.dumps([{"surah": 1, "ayah": 1, "stats": {}}]).encode()
        ayat = quran_align.parse_asset(payload, "x.json")
        self.assertEqual(ayat[(1, 1)].segments, [])

    def test_malformed_segment_fails(self) -> None:
        payload = json.dumps([{"surah": 1, "ayah": 1, "segments": [[0, 1, "x"]]}]).encode()
        with self.assertRaises(ValidationError):
            quran_align.parse_asset(payload, "x.json")


if __name__ == "__main__":
    unittest.main()
