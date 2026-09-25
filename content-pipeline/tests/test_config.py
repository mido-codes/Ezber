from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ezber_pipeline.config import load_config
from ezber_pipeline.errors import ConfigError
from ezber_pipeline.sources import word_level
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
        self.assertFalse(config.word_level["enabled"])
        self.assertTrue(all(not fallback["enabled"] for fallback in config.fallback_sources))

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

    def test_enabled_word_level_source_without_adapter_fails(self) -> None:
        def mutate(document):
            document["enabled"] = True
            document["active_source"] = "not_registered"

        self._rewrite("word_level.json", mutate)
        config = load_config(self.config_dir)
        with self.assertRaises(ConfigError):
            word_level.resolve_adapter(config.word_level)

    def test_disabled_word_level_resolves_to_none(self) -> None:
        config = load_config(self.config_dir)
        self.assertIsNone(word_level.resolve_adapter(config.word_level))


if __name__ == "__main__":
    unittest.main()
