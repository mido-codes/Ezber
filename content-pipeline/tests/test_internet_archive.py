from __future__ import annotations

import json
import unittest

from ezber_pipeline.errors import ValidationError
from ezber_pipeline.sources import internet_archive
from tests import helpers


class InternetArchiveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.item = internet_archive.parse_item(
            helpers.synthetic_ia_metadata("fake-item", {"murattal": [32]}), identifier="fake-item"
        )

    def test_license_check(self) -> None:
        internet_archive.check_license(
            self.item, "https://creativecommons.org/licenses/by/4.0/", "fake"
        )
        with self.assertRaises(ValidationError):
            internet_archive.check_license(self.item, "https://creativecommons.org/licenses/by-sa/4.0/", "fake")

    def test_license_url_normalization_accepts_http(self) -> None:
        payload = json.loads(helpers.synthetic_ia_metadata("x", {"murattal": [32]}))
        payload["metadata"]["licenseurl"] = "http://creativecommons.org/licenses/by/4.0/"
        item = internet_archive.parse_item(json.dumps(payload).encode(), identifier="x")
        internet_archive.check_license(item, "https://creativecommons.org/licenses/by/4.0/", "x")

    def test_resolves_all_chapters_and_missing_file_fails(self) -> None:
        facts = internet_archive.resolve_audio(
            self.item, style="murattal", bitrate=32, extension="m4a", surah_count=114
        )
        self.assertEqual(len(facts), 114)
        self.assertEqual(facts[0]["path"], "murattal/32/001.m4a")
        self.assertTrue(facts[0]["url"].startswith("https://archive.org/download/fake-item/"))
        with self.assertRaises(ValidationError):
            internet_archive.resolve_audio(
                self.item, style="murattal", bitrate=128, extension="m4a", surah_count=114
            )

    def test_timing_parser_and_preamble(self) -> None:
        timing = internet_archive.parse_timing(helpers.synthetic_timing(preamble=True, style="murattal"))
        self.assertEqual(len(timing), 114)
        self.assertEqual(timing[1][0][0], 0)
        self.assertEqual(timing[1][1][0], 1)
        self.assertEqual([row[0] for row in timing[1][1:]], list(range(1, 8)))

    def test_timing_digest_is_order_independent(self) -> None:
        first = internet_archive.timing_digest({2: [11, 12], 1: [9]})
        second = internet_archive.timing_digest({1: [9], 2: [11, 12]})
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
