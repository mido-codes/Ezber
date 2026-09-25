from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ezber_pipeline.config import load_config
from ezber_pipeline.errors import ConfigError
from tests import helpers
from tests.test_e2e_offline import RECITER_SPECS


class ConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="ezber-config-")
        self.addCleanup(self.temp.cleanup)
        self.config_dir = Path(self.temp.name) / "config"
        helpers.write_synthetic_config(self.config_dir, RECITER_SPECS)

    def _rewrite(self, name: str, mutate) -> None:
        path = self.config_dir / name
        document = json.loads(path.read_text(encoding="utf-8"))
        mutate(document)
        path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    def test_committed_config_loads(self) -> None:
        config = load_config()
        self.assertEqual(config.content_policy["mode"], "offline-redistributable")
        self.assertEqual(config.enabled_reciters(), [])
        self.assertTrue(config.word_timing["enabled"])
        self.assertEqual(len(config.enabled_timing_recitations()), 11)
        excluded = [
            recitation
            for recitation in config.word_timing["recitations"]
            if recitation["status"] == "excluded"
        ]
        self.assertEqual(len(excluded), 1)
        self.assertTrue(excluded[0]["excluded_reason"])
        self.assertEqual(config.transliteration["edition"]["resource_id"], "tanzil.en.transliteration")

    def test_enabled_fallback_is_rejected(self) -> None:
        def mutate(document):
            document["fallback_sources"][0]["enabled"] = True

        self._rewrite("reciters.json", mutate)
        with self.assertRaises(ConfigError):
            load_config(self.config_dir)

    def test_reciter_requires_explicit_enabled_flag(self) -> None:
        def mutate(document):
            document["reciters"][0].pop("enabled")

        self._rewrite("reciters.json", mutate)
        with self.assertRaises(ConfigError):
            load_config(self.config_dir)

    def test_translation_license_must_exist(self) -> None:
        def mutate(document):
            document["edition"]["license_id"] = "not-in-registry"

        self._rewrite("transliteration.json", mutate)
        with self.assertRaises(ConfigError):
            load_config(self.config_dir)

    def test_word_timing_requires_an_enabled_recitation(self) -> None:
        def mutate(document):
            for recitation in document["recitations"]:
                recitation["status"] = "excluded"
                recitation["excluded_reason"] = "test"

        self._rewrite("word_timing.json", mutate)
        with self.assertRaises(ConfigError):
            load_config(self.config_dir)

    def test_word_timing_excluded_entries_need_a_reason(self) -> None:
        def mutate(document):
            document["recitations"][0]["status"] = "excluded"
            document["recitations"][0].pop("excluded_reason", None)

        self._rewrite("word_timing.json", mutate)
        with self.assertRaises(ConfigError):
            load_config(self.config_dir)


if __name__ == "__main__":
    unittest.main()
