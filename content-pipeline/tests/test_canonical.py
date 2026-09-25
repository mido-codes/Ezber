from __future__ import annotations

import json
import unittest

from ezber_pipeline.canonical import canonical_json_bytes, digest_json


class CanonicalJsonTests(unittest.TestCase):
    def test_sorted_keys_and_trailing_newline(self) -> None:
        data = canonical_json_bytes({"b": 1, "a": [2, 3]})
        self.assertEqual(data.decode("utf-8"), '{\n  "a": [\n    2,\n    3\n  ],\n  "b": 1\n}\n')

    def test_insertion_order_does_not_change_digest(self) -> None:
        first = digest_json({"a": 1, "b": {"c": 2, "d": [3, 4]}})
        second = digest_json({"b": {"d": [3, 4], "c": 2}, "a": 1})
        self.assertEqual(first, second)

    def test_unicode_is_not_escaped(self) -> None:
        self.assertIn("ﷲ", canonical_json_bytes({"text": "ﷲ"}).decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
