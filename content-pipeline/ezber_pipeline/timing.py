"""Map quran-align word ranges onto transliteration tokens.

quran-align indexes words in the Tanzil Uthmani text split on spaces (``N``
words per ayah). Ezber's display unit is the Tanzil transliteration token
(``M`` tokens per ayah), which differs from ``N`` on a small share of ayahs.
The pipeline therefore:

1. repairs the released segments and builds a non-decreasing, piecewise-linear
   time function ``f`` over Uthmani word positions;
2. aligns tokens to words monotonically by rounding the proportional boundary
   ``j*M/N`` to the nearest token index, so a token never crosses a word
   boundary (for ``M == N`` this is the identity);
3. gives a word's tokens sub-ranges of that word's span, proportional to token
   length, or gives a token that spans several words the union of their spans;
4. forces the final token boundaries to be strictly increasing.

All repairs are deterministic and counted so the manifest can state them:
reversed segments are swapped, zero-length and out-of-range segments are
dropped, word-range overlaps are clamped, time inversions are flattened, words
without coverage are interpolated between their neighbours, and an ayah with no
usable segments is synthesised from the recitation's average word duration.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field

from .sources.quran_align import QASegment


@dataclass(frozen=True)
class TokenTiming:
    boundaries: list[int]  # token_count + 1 strictly increasing millisecond boundaries
    repairs: dict[str, int] = field(default_factory=dict)

    @property
    def whole_ayah(self) -> tuple[int, int]:
        return self.boundaries[0], self.boundaries[-1]

    def token_range(self, token_index: int) -> tuple[int, int]:
        """token_index is 0-based."""
        return self.boundaries[token_index], self.boundaries[token_index + 1]


def map_tokens(
    segments: list[QASegment],
    *,
    word_count: int,
    token_count: int,
    fallback_avg_ms: float,
    token_lengths: list[int] | None = None,
) -> TokenTiming:
    if word_count <= 0:
        raise ValueError("word_count must be positive")
    if token_count <= 0:
        raise ValueError("token_count must be positive")
    if token_lengths is not None and len(token_lengths) != token_count:
        raise ValueError("token_lengths must have one entry per token")

    repairs = {
        "reversed_start_end": 0,
        "zero_length": 0,
        "out_of_range": 0,
        "word_overlap": 0,
        "time_inversions": 0,
        "synthesized_ayahs": 0,
    }

    cleaned: list[tuple[int, int, int, int]] = []
    for segment in segments:
        word_start, word_end = segment.word_start, segment.word_end
        start_ms, end_ms = segment.start_ms, segment.end_ms
        if word_start < 0 or word_end > word_count:
            repairs["out_of_range"] += 1
        word_start = max(0, word_start)
        word_end = min(word_count, word_end)
        if word_start >= word_end:
            continue
        if start_ms > end_ms:
            start_ms, end_ms = end_ms, start_ms
            repairs["reversed_start_end"] += 1
        if start_ms == end_ms:
            repairs["zero_length"] += 1
            continue
        cleaned.append((word_start, word_end, start_ms, end_ms))

    cleaned.sort(key=lambda entry: (entry[0], entry[1]))
    final: list[tuple[int, int, int, int]] = []
    for word_start, word_end, start_ms, end_ms in cleaned:
        if final and word_start < final[-1][1]:
            repairs["word_overlap"] += 1
            word_start = final[-1][1]
        if word_start >= word_end:
            continue
        final.append((word_start, word_end, start_ms, end_ms))

    if not final:
        repairs["synthesized_ayahs"] = 1
        step = max(1.0, fallback_avg_ms)
        boundaries = _split_spans(
            word_starts=[int(round(index * step)) for index in range(word_count + 1)],
            word_count=word_count,
            token_count=token_count,
            token_lengths=token_lengths,
        )
        return TokenTiming(boundaries=_strictly_increasing(boundaries), repairs=repairs)

    points: list[tuple[int, int]] = []
    for word_start, word_end, start_ms, end_ms in final:
        points.append((word_start, start_ms))
        points.append((word_end, end_ms))
    points.sort()
    compressed: list[tuple[int, int]] = []
    for position, time_ms in points:
        if compressed and compressed[-1][0] == position:
            if time_ms < compressed[-1][1]:
                repairs["time_inversions"] += 1
                time_ms = compressed[-1][1]
            compressed[-1] = (position, time_ms)
            continue
        if compressed and time_ms < compressed[-1][1]:
            repairs["time_inversions"] += 1
            time_ms = compressed[-1][1]
        compressed.append((position, time_ms))

    first_pos, first_time = compressed[0]
    last_pos, last_time = compressed[-1]
    if last_pos > first_pos and last_time > first_time:
        average_word_ms = (last_time - first_time) / (last_pos - first_pos)
    else:
        average_word_ms = max(1.0, fallback_avg_ms)
    start_time = max(0, int(round(first_time - first_pos * average_word_ms)))
    end_time = max(start_time + 1, int(round(last_time + (word_count - last_pos) * average_word_ms)))

    full: list[tuple[int, int]] = [(0, start_time)] + compressed + [(word_count, end_time)]
    positions = [position for position, _ in full]
    times: list[int] = []
    for _, time_ms in full:
        if times and time_ms < times[-1]:
            repairs["time_inversions"] += 1
            time_ms = times[-1]
        times.append(time_ms)

    def time_at(position: float) -> int:
        index = bisect.bisect_right(positions, position) - 1
        if index >= len(full) - 1:
            return times[-1]
        left_pos, left_time = full[index]
        right_pos, right_time = full[index + 1]
        if right_pos == left_pos:
            return right_time
        ratio = (position - left_pos) / (right_pos - left_pos)
        return int(round(left_time + (right_time - left_time) * ratio))

    word_starts = [time_at(index) for index in range(word_count + 1)]
    boundaries = _split_spans(
        word_starts=word_starts,
        word_count=word_count,
        token_count=token_count,
        token_lengths=token_lengths,
    )
    return TokenTiming(boundaries=_strictly_increasing(boundaries), repairs=repairs)


def _split_spans(
    *,
    word_starts: list[int],
    word_count: int,
    token_count: int,
    token_lengths: list[int] | None,
) -> list[int]:
    """Align tokens to words monotonically, then split each word's span."""
    # Token boundary before word j (0 <= j <= word_count), rounded to the
    # nearest token index. Boundaries repeat when one token spans several words.
    word_token_bounds = [
        min(token_count, int(math.floor(index * token_count / word_count + 0.5)))
        for index in range(word_count + 1)
    ]
    word_token_bounds[0] = 0
    word_token_bounds[-1] = token_count
    for index in range(1, len(word_token_bounds)):
        word_token_bounds[index] = max(word_token_bounds[index], word_token_bounds[index - 1])
    for index in range(len(word_token_bounds) - 2, -1, -1):
        word_token_bounds[index] = min(word_token_bounds[index], word_token_bounds[index + 1])

    boundaries: list[int | None] = [None] * (token_count + 1)
    assigned = [False] * token_count
    for word_index in range(word_count):
        token_start = word_token_bounds[word_index]
        token_end = word_token_bounds[word_index + 1]
        if token_start >= token_end:
            continue
        span_start = word_starts[word_index]
        span_end = word_starts[word_index + 1]
        weights = (
            [max(1, length) for length in token_lengths[token_start:token_end]]
            if token_lengths is not None
            else [1] * (token_end - token_start)
        )
        total_weight = sum(weights)
        boundaries[token_start] = span_start
        boundaries[token_end] = span_end
        accumulated = 0
        for offset, weight in enumerate(weights):
            accumulated += weight
            boundaries[token_start + offset + 1] = span_start + int(
                round((span_end - span_start) * accumulated / total_weight)
            )
            assigned[token_start + offset] = True

    # Tokens that span several words inherit the union of those words' spans.
    for token_index in range(token_count):
        if assigned[token_index]:
            continue
        first_word = next(
            index
            for index in range(word_count)
            if word_token_bounds[index + 1] > token_index
        )
        last_word = max(
            index
            for index in range(word_count)
            if word_token_bounds[index] < token_index + 1
        )
        boundaries[token_index] = word_starts[first_word]
        boundaries[token_index + 1] = word_starts[last_word + 1]

    resolved = [
        value if value is not None else word_starts[0] for value in boundaries
    ]
    resolved[0] = word_starts[0]
    resolved[-1] = word_starts[-1]
    return resolved


def _strictly_increasing(boundaries: list[int]) -> list[int]:
    for index in range(1, len(boundaries)):
        if boundaries[index] <= boundaries[index - 1]:
            boundaries[index] = boundaries[index - 1] + 1
    return boundaries
