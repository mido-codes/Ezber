"""Pipeline error types with operator-facing messages."""

from __future__ import annotations


class PipelineError(RuntimeError):
    """Base class for all pipeline failures."""


class ConfigError(PipelineError):
    """A configuration file is missing, malformed or incomplete."""


class FetchError(PipelineError):
    """A source could not be fetched."""


class OfflineCacheMiss(PipelineError):
    """Offline mode was requested but the source is not in the cache."""


class SourceChangedError(PipelineError):
    """A fetched source no longer matches the committed source lock.

    Upstream content is allowed to change, but only deliberately: rerun with
    ``--update-lock`` after reviewing the new content.
    """


class ValidationError(PipelineError):
    """One or more content checks failed.""" 

    def __init__(self, failures: list[str]) -> None:
        self.failures = failures
        detail = "\n".join(f"  - {failure}" for failure in failures)
        super().__init__(f"{len(failures)} validation check(s) failed:\n{detail}")
