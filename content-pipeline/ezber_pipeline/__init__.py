"""Ezber content pipeline: fetch, normalize, validate and package Quran content.

The pipeline is stdlib-only on purpose: a foundation build must run on any
machine with Python 3.11+ and no network-installed dependencies, and a build
must be reproducible byte-for-byte from pinned upstream sources.
"""

__all__ = ["__version__"]

__version__ = "0.3.0"

PIPELINE_NAME = "ezber-content-pipeline"
SCHEMA_VERSION = 1
