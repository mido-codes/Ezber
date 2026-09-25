"""Source adapters: one module per upstream system."""

from . import internet_archive, tanzil, word_level

__all__ = ["internet_archive", "tanzil", "word_level"]
