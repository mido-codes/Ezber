from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ezber_pipeline.errors import SourceChangedError
from ezber_pipeline.lockfile import LockBook


class LockBookTests(unittest.TestCase):
    def test_bootstraps_then_verifies(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "source-lock.json"
            book = LockBook(path)
            book.check_or_record("tanzil_text", {"sha256": "abc", "bytes": 1})
            book.write()
            self.assertTrue(path.exists())
            self.assertTrue(book.created)

            verify = LockBook(path)
            verify.check_or_record("tanzil_text", {"sha256": "abc", "bytes": 1})
            self.assertFalse(verify.created)

    def test_detects_upstream_change(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "source-lock.json"
            book = LockBook(path)
            book.check_or_record("tanzil_text", {"sha256": "abc"})
            book.write()

            verify = LockBook(path)
            with self.assertRaises(SourceChangedError):
                verify.check_or_record("tanzil_text", {"sha256": "def"})

    def test_update_accepts_change(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "source-lock.json"
            book = LockBook(path)
            book.check_or_record("tanzil_text", {"sha256": "abc"})
            book.write()

            update = LockBook(path, update=True)
            update.check_or_record("tanzil_text", {"sha256": "def"})
            self.assertTrue(update.updated)
            update.write()
            self.assertEqual(json.loads(path.read_text())["sources"]["tanzil_text"]["sha256"], "def")


if __name__ == "__main__":
    unittest.main()
