"""Source lock: pins every upstream input to the exact bytes/digests used.

The lock is committed. A rebuild verifies each fetched source against it and
fails loudly when upstream content changed, so the bundle can never drift
silently. ``--update-lock`` is the deliberate escape hatch.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .canonical import load_json, write_bytes, canonical_json_bytes
from .errors import SourceChangedError


class LockBook:
    def __init__(self, path: Path | str, *, update: bool = False) -> None:
        self.path = Path(path)
        self.update = update
        self.existing: dict[str, Any] = {}
        self.observed: dict[str, Any] = {}
        if self.path.exists():
            self.existing = load_json(str(self.path)).get("sources", {})
        self.created = not self.path.exists()
        self.updated = False

    def check_or_record(self, key: str, entry: dict[str, Any]) -> None:
        """Verify an observed source against the lock, or record it.

        With ``update`` set, the observed entry always wins (a deliberate
        refresh). On the first build the lock does not exist yet and is
        bootstrapped from observed values.
        """
        self.observed[key] = entry
        if self.update:
            if key in self.existing and self.existing[key] != entry:
                self.updated = True
            return
        if self.created or key not in self.existing:
            return
        previous = self.existing[key]
        if previous != entry:
            raise SourceChangedError(
                f"source {key!r} changed since the committed lock was written.\n"
                f"  locked:   {previous}\n"
                f"  observed: {entry}\n"
                "Review the upstream change, then rerun with --update-lock to accept it."
            )

    def write(self) -> None:
        document = {
            "lock_version": 1,
            "sources": dict(sorted(self.observed.items())),
        }
        write_bytes(self.path, canonical_json_bytes(document))
