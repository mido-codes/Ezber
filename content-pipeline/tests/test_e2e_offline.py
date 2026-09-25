from __future__ import annotations

import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from ezber_pipeline import cli
from ezber_pipeline.config import CONTENT_SCHEMA_PATH, load_config
from ezber_pipeline.errors import SourceChangedError
from ezber_pipeline.lockfile import LockBook
from ezber_pipeline.normalize import build_bundle
from ezber_pipeline.package import write_artifacts
from ezber_pipeline.validate import ensure_valid
from tests import helpers

RECITER_SPECS = [
    {
        "remote_id": "fake-reciter-a",
        "name": "Fake Reciter A",
        "license_metadata_url": "https://archive.org/metadata/fake-reciter-a",
        "styles_bitrates": {"murattal": [32]},
        "timings": {"murattal": helpers.synthetic_timing(preamble=False, style="murattal")},
    },
    {
        "remote_id": "fake-reciter-b",
        "name": "Fake Reciter B",
        "license_metadata_url": "https://archive.org/metadata/fake-reciter-b",
        "styles_bitrates": {"murattal": [32]},
        "timings": {"murattal": helpers.synthetic_timing(preamble=True, style="murattal")},
    },
]


class OfflineBuildTests(unittest.TestCase):
    def setUp(self) -> None:
        self.saved = helpers.clean_qf_environment()
        self.addCleanup(helpers.restore_qf_environment, self.saved)
        self.temp = tempfile.TemporaryDirectory(prefix="ezber-e2e-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        helpers.write_synthetic_config(self.root / "config", RECITER_SPECS, page_size=50)
        self.config = load_config(self.root / "config")
        self.fetcher = helpers.synthetic_corpus(
            self.config, RECITER_SPECS, page_size=self.config.quran_foundation["page_size"]
        )

    def _build(self, output_name: str, lock_path: Path):
        lock = LockBook(lock_path)
        bundle = build_bundle(self.config, self.fetcher, lock)
        checks = ensure_valid(bundle, self.config)
        self.assertTrue(all(check.ok for check in checks))
        lock.write()
        result = write_artifacts(
            bundle,
            self.config,
            CONTENT_SCHEMA_PATH,
            self.root / output_name,
            checks=checks,
            lock_path=lock_path,
            lock_created=lock.created,
            lock_updated=lock.updated,
        )
        return bundle, result

    @mock.patch.dict(os.environ, {"SOURCE_DATE_EPOCH": "1700000000"})
    def test_full_build_is_valid_and_deterministic(self) -> None:
        lock_path = self.root / "source-lock.json"
        bundle, first = self._build("out1", lock_path)
        self.assertEqual(len(bundle.surahs), 114)
        self.assertEqual(len(bundle.ayahs), 6236)
        self.assertEqual(len(bundle.reciters), 2)
        self.assertEqual(len(bundle.audio_files), 228)
        self.assertEqual(len(bundle.segments), 12472)
        self.assertEqual(len(bundle.translation_rows), 6236)
        self.assertEqual(len(bundle.transliteration_rows), 6236)
        self.assertEqual(bundle.access_mode, "public-legacy")
        self.assertTrue(lock_path.exists())

        _, second = self._build("out2", lock_path)
        self.assertEqual(first.database_sha256, second.database_sha256)
        self.assertEqual(first.logical_digest, second.logical_digest)
        for name, path in first.artifacts.items():
            if name == "build_report":
                # the report records whether the lock was created by this run
                continue
            other = second.artifacts[name]
            self.assertEqual(
                path.read_bytes(),
                other.read_bytes(),
                f"artifact {name} differs between identical builds",
            )

    def test_lock_detects_upstream_change(self) -> None:
        lock_path = self.root / "source-lock.json"
        self._build("out1", lock_path)
        changed = helpers.synthetic_tanzil_text_xml() + b"<!-- upstream changed -->"
        self.fetcher.routes[self.config.sources["tanzil_text"].url] = changed
        lock = LockBook(lock_path)
        with self.assertRaises(SourceChangedError):
            build_bundle(self.config, self.fetcher, lock, require_qf_auth=False)

    @mock.patch.dict(os.environ, {"SOURCE_DATE_EPOCH": "1700000000"})
    def test_cli_verify_accepts_built_bundle(self) -> None:
        lock_path = self.root / "source-lock.json"
        self._build("out1", lock_path)
        with redirect_stdout(io.StringIO()) as stdout:
            code = cli.main(
                [
                    "verify",
                    "--config-dir",
                    str(self.root / "config"),
                    "--output-dir",
                    str(self.root / "out1"),
                ]
            )
        self.assertEqual(code, 0)
        self.assertIn("verify: ok", stdout.getvalue())

    def test_cli_verify_rejects_missing_bundle(self) -> None:
        with redirect_stderr(io.StringIO()):
            code = cli.main(
                [
                    "verify",
                    "--config-dir",
                    str(self.root / "config"),
                    "--output-dir",
                    str(self.root / "nowhere"),
                ]
            )
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
