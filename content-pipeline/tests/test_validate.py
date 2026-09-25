from __future__ import annotations

import copy
import dataclasses
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
        self.temp = tempfile.TemporaryDirectory(prefix="ezber-validate-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        helpers.write_synthetic_config(root / "config", RECITER_SPECS)
        self.config = load_config(root / "config")
        self.fetcher = helpers.synthetic_corpus(self.config, RECITER_SPECS)

    def _bundle(self):
        lock = LockBook(Path(self.temp.name) / "lock.json")
        return build_bundle(self.config, self.fetcher, lock), self.config

    def _failures(self, bundle, config) -> list[str]:
        return [check.name for check in run_checks(bundle, config) if not check.ok]

    def test_baseline_bundle_passes(self) -> None:
        bundle, config = self._bundle()
        self.assertEqual(self._failures(bundle, config), [])

    def test_missing_attribution_fails(self) -> None:
        bundle, config = self._bundle()
        bundle = copy.deepcopy(bundle)
        bundle.reciters[0] = dataclasses.replace(bundle.reciters[0], attribution="")
        self.assertIn("licenses.complete_and_compliant", self._failures(bundle, config))

    def test_quranicaudio_url_fails(self) -> None:
        bundle, config = self._bundle()
        bundle = copy.deepcopy(bundle)
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
        self.assertIn("policy.deny_list", self._failures(bundle, config))

    def test_missing_audio_segments_fail(self) -> None:
        bundle, config = self._bundle()
        bundle = copy.deepcopy(bundle)
        bundle.segments = [segment for segment in bundle.segments if segment.reciter_id != 1]
        self.assertIn("segments.coverage_and_ranges", self._failures(bundle, config))

    def test_missing_word_timing_segments_fail(self) -> None:
        bundle, config = self._bundle()
        bundle = copy.deepcopy(bundle)
        timing_reciter_id = next(reciter.id for reciter in bundle.reciters if reciter.source == "quran_align")
        bundle.segments = [
            segment
            for segment in bundle.segments
            if not (segment.reciter_id == timing_reciter_id and segment.word_index > 0)
        ]
        self.assertIn("segments.coverage_and_ranges", self._failures(bundle, config))

    def test_word_segment_without_word_row_fails(self) -> None:
        bundle, config = self._bundle()
        bundle = copy.deepcopy(bundle)
        bundle.words = [word for word in bundle.words if word.position != 1]
        self.assertIn("words.integrity", self._failures(bundle, config))
        self.assertIn("segments.coverage_and_ranges", self._failures(bundle, config))

    def test_empty_transliteration_fails(self) -> None:
        bundle, config = self._bundle()
        bundle = copy.deepcopy(bundle)
        bundle.transliteration_rows[-1] = dataclasses.replace(bundle.transliteration_rows[-1], text="  ")
        self.assertIn("editions.complete", self._failures(bundle, config))


if __name__ == "__main__":
    unittest.main()
