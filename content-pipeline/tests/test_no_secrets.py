from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from tests import helpers

SKIP_DIRS = {".git", "__pycache__", ".cache", "build", ".mypy_cache", ".ruff_cache"}
TEXT_SUFFIXES = {".py", ".json", ".md", ".sql", ".txt", ".sh", ".toml", ".yml", ".yaml", ".cfg", ".ini"}
SECRET_ASSIGNMENT = re.compile(r"QF_CLIENT_SECRET\s*=\s*[^\s\"']")
CLIENT_SECRET_VALUE = re.compile(r"(?<!env_var_)client_secret\s*(?::|=)\s*\"[^\"]{6,}\"", re.IGNORECASE)


def _iter_files():
    root = helpers.REPO_ROOT
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix in TEXT_SUFFIXES:
            yield path


class NoSecretsTests(unittest.TestCase):
    def test_no_env_style_secret_assignments(self) -> None:
        offenders = []
        for path in _iter_files():
            text = path.read_text(encoding="utf-8", errors="replace")
            if SECRET_ASSIGNMENT.search(text):
                offenders.append(str(path.relative_to(helpers.REPO_ROOT)))
        self.assertEqual(offenders, [], f"hard-coded QF client secret assignments: {offenders}")

    def test_config_json_has_no_secret_values(self) -> None:
        def walk(node, path="$"):
            if isinstance(node, dict):
                for key, value in node.items():
                    if key == "client_secret" and isinstance(value, str) and value:
                        self.fail(f"config value at {path}.{key} looks like a secret")
                    walk(value, f"{path}.{key}")
            elif isinstance(node, list):
                for index, value in enumerate(node):
                    walk(value, f"{path}[{index}]")

        for path in (helpers.REPO_ROOT / "content-pipeline" / "config").glob("*.json"):
            walk(json.loads(path.read_text(encoding="utf-8")), path.name)

    def test_gitignore_covers_local_secrets_and_builds(self) -> None:
        gitignore = (helpers.REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        for entry in (".env", ".cache", "__pycache__"):
            self.assertIn(entry, gitignore)


if __name__ == "__main__":
    unittest.main()
