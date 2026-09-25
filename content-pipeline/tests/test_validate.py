from __future__ import annotations

import copy
import tempfile
import unittest
from pathlib import Path

from ezber_pipeline.bundle import AudioFile
from ezber_pipeline.config import load_config
from ezber_pipeline.lockfile import LockBook
from ezber_pipeline.normalize import build_bundle
from ezber_pipeline.validate import run_checks
from tests import helpers
from tests.test_e2e_offline import RECITER_SPECS


class ValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.saved = helpers.clean_qf_environment()
        self.addCleanup(helpers.restore_qf_environment, self.saved)
        self.temp = tempfile.TemporaryDirectory(prefix="ezber-validate-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        helpers.write_synthetic_config(root / "config", RECITER_SPECS, page_size=50)
        self.config = load_config(root / "config")
        self.fetcher = helpers.synthetic_corpus(
            self.config, RECITER_SPECS, page_size=self.config.quran_foundation["page_size"]
        )

    def _bundle(self):
        lock = LockBook(Path(self.temp.name) / "lock.json")
        return build_bundle(self.config, self.fetcher, lock)

    def _failures(self, bundle) -> list[str]:
        return [check.name for check in run_checks(bundle, self.config) if not check.ok]

    def test_baseline_bundle_passes(self) -> None:
        bundle = self._bundle()
        self.assertEqual(self._failures(bundle), [])

    def test_missing_translation_row_fails(self) -> None:
        bundle = copy.deepcopy(self._bundle())
        bundle.translation_rows.pop()
        self.assertIn("editions.complete", self._failures(bundle))

    def test_missing_attribution_fails(self) -> None:
        import dataclasses

        bundle = copy.deepcopy(self._bundle())
        bundle.reciters[0] = dataclasses.replace(bundle.reciters[0], attribution="")
        self.assertIn("licenses.complete_and_compliant", self._failures(bundle))

    def test_quranicaudio_url_fails(self) -> None:
        bundle = copy.deepcopy(self._bundle())
        template = bundle.audio_files[0]
        bundle.audio_files.append(
            AudioFile(
                reciter_id=template.reciter_id,
                kind="chapter",
                surah_id=1,
                ayah=None,
                chapter=1,
                variant=template.variant,
                url="https://download.quranicaudio.com/qdc/reciter/1.mp3",
                local_path=None,
                bytes=1,
                bitrate=128,
                duration_ms=1000,
                checksum="sha1:aa",
                downloaded_at=None,
            )
        )
        failures = self._failures(bundle)
        self.assertIn("policy.deny_list", failures)

    def test_missing_segments_fail(self) -> None:
        bundle = copy.deepcopy(self._bundle())
        bundle.segments = [segment for segment in bundle.segments if segment.reciter_id != 1]
        self.assertIn("segments.coverage_and_ranges", self._failures(bundle))


if __name__ == "__main__":
    unittest.main()
