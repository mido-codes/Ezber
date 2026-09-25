"""Canonical serialization and digests.

Everything that lands in a manifest, a lock file or a database digest goes
through these helpers so two builds over the same inputs produce identical
bytes. Rules:

* JSON is UTF-8, ``ensure_ascii=False``, ``sort_keys=True``, 2-space indent,
  ``\n`` line endings and a single trailing newline.
* Digests are prefixed with the algorithm (``sha256:<hex>``) everywhere a
  digest is stored, so the manifest format can add algorithms later.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_json_bytes(value: Any, *, indent: int | None = 2) -> bytes:
    """Serialize a JSON-compatible value deterministically."""
    text = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        indent=indent,
        separators=(",", ": ") if indent else (",", ":"),
    )
    return (text + "\n").encode("utf-8")


def compact_json_bytes(value: Any) -> bytes:
    """Serialize for hashing: no insignificant whitespace, sorted keys."""
    return canonical_json_bytes(value, indent=None)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_digest(data: bytes) -> str:
    return f"sha256:{sha256_hex(data)}"


def digest_json(value: Any) -> str:
    """Digest a JSON value using canonical serialization."""
    return sha256_digest(compact_json_bytes(value))


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_bytes(path: str, data: bytes) -> None:
    with open(path, "wb") as handle:
        handle.write(data)
