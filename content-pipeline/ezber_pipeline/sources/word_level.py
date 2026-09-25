"""Word-level transliteration and per-word timing adapter seam.

Word highlighting needs two things from one redistributable source:

* the transliteration of every word of every ayah, and
* per-word start/end times aligned to a specific recitation.

No such source has cleared the rights review yet, so `config/word_level.json`
ships disabled and the pipeline bundles no word rows. The contract below is the
swap-in point: register a factory with :func:`register_adapter` under the
candidate's ``source_id``, set it as ``active_source`` in the config, and the
rest of the pipeline (normalization, validation, SQLite, manifests) carries the
data without further changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol

from ..errors import ConfigError
from ..fetch import Fetcher


@dataclass(frozen=True)
class WordToken:
    surah: int
    ayah: int
    position: int  # 1-based word position inside the ayah
    transliteration: str
    text_uthmani: str | None = None
    translation: str | None = None


@dataclass(frozen=True)
class WordTiming:
    surah: int
    ayah: int
    position: int
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class TimingTarget:
    reciter_remote_id: str
    variant: str


@dataclass(frozen=True)
class WordLevelData:
    source_id: str
    name: str
    language: str
    license_id: str
    license_url: str
    license_evidence_url: str
    attribution: str
    words: list[WordToken] = field(default_factory=list)
    ayah_transliteration: dict[str, str] | None = None  # optional explicit verse line
    timing_target: TimingTarget | None = None
    timings: list[WordTiming] = field(default_factory=list)


class WordLevelAdapter(Protocol):
    source_id: str

    def fetch(self, fetcher: Fetcher, *, verse_counts: dict[int, int]) -> WordLevelData: ...


_FACTORIES: dict[str, Callable[[], WordLevelAdapter]] = {}


def register_adapter(source_id: str, factory: Callable[[], WordLevelAdapter]) -> None:
    """Register an adapter factory for a candidate source id."""
    _FACTORIES[source_id] = factory


def registered_adapters() -> list[str]:
    return sorted(_FACTORIES)


def resolve_adapter(word_level_config: dict) -> WordLevelAdapter | None:
    """Return the configured adapter, or None when word-level data is off."""
    if not word_level_config.get("enabled", False):
        return None
    source_id = word_level_config.get("active_source")
    if not source_id:
        raise ConfigError("word_level.enabled is true but active_source is not set")
    factory = _FACTORIES.get(source_id)
    if factory is None:
        raise ConfigError(
            f"word-level source {source_id!r} is enabled but no adapter is registered; "
            f"available adapters: {registered_adapters()}"
        )
    return factory()
