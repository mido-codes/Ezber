from __future__ import annotations

import unittest

from ezber_pipeline.timing import map_tokens
from ezber_pipeline.sources.quran_align import QASegment


class TimingMapTests(unittest.TestCase):
    def test_exact_mapping_when_token_count_equals_word_count(self) -> None:
        segments = [
            QASegment(0, 1, 100, 500),
            QASegment(1, 2, 500, 900),
            QASegment(2, 3, 900, 1500),
        ]
        timing = map_tokens(segments, word_count=3, token_count=3, fallback_avg_ms=500)
        self.assertEqual(timing.boundaries, [100, 500, 900, 1500])
        self.assertEqual(timing.whole_ayah, (100, 1500))
        self.assertEqual(timing.repairs["reversed_start_end"], 0)

    def test_split_word_produces_two_tokens_inside_its_span(self) -> None:
        segments = [QASegment(0, 1, 0, 1000), QASegment(1, 2, 1000, 2000)]
        timing = map_tokens(segments, word_count=2, token_count=3, fallback_avg_ms=500)
        self.assertEqual(len(timing.boundaries), 4)
        # word 0 owns tokens 0 and 1, split inside its span; token 2 is word 1
        self.assertEqual(timing.boundaries, [0, 500, 1000, 2000])
        self.assertTrue(all(right > left for left, right in zip(timing.boundaries, timing.boundaries[1:])))

    def test_reversed_and_zero_length_segments_are_repaired(self) -> None:
        segments = [
            QASegment(0, 1, 800, 300),  # reversed
            QASegment(1, 2, 900, 900),  # zero length
            QASegment(2, 3, 1200, 1500),
        ]
        timing = map_tokens(segments, word_count=3, token_count=3, fallback_avg_ms=500)
        self.assertEqual(timing.repairs["reversed_start_end"], 1)
        self.assertEqual(timing.repairs["zero_length"], 1)
        self.assertTrue(all(right > left for left, right in zip(timing.boundaries, timing.boundaries[1:])))

    def test_out_of_range_segments_are_clamped_or_dropped(self) -> None:
        segments = [QASegment(-2, 9, 100, 400)]
        timing = map_tokens(segments, word_count=3, token_count=3, fallback_avg_ms=500)
        self.assertGreaterEqual(timing.repairs["out_of_range"], 1)
        self.assertTrue(all(value >= 0 for value in timing.boundaries))

    def test_missing_words_are_interpolated(self) -> None:
        segments = [QASegment(0, 1, 0, 1000), QASegment(3, 4, 4000, 5000)]
        timing = map_tokens(segments, word_count=4, token_count=4, fallback_avg_ms=500)
        self.assertEqual(timing.boundaries, [0, 1000, 2500, 4000, 5000])

    def test_ayah_without_segments_is_synthesized(self) -> None:
        timing = map_tokens([], word_count=4, token_count=4, fallback_avg_ms=500)
        self.assertEqual(timing.repairs["synthesized_ayahs"], 1)
        self.assertEqual(len(timing.boundaries), 5)
        self.assertEqual(timing.boundaries[0], 0)
        self.assertTrue(all(right > left for left, right in zip(timing.boundaries, timing.boundaries[1:])))

    def test_boundaries_are_always_strictly_increasing(self) -> None:
        segments = [QASegment(0, 4, 500, 500), QASegment(0, 1, 500, 500)]
        timing = map_tokens(segments, word_count=4, token_count=7, fallback_avg_ms=10)
        self.assertTrue(all(right > left for left, right in zip(timing.boundaries, timing.boundaries[1:])))


if __name__ == "__main__":
    unittest.main()
