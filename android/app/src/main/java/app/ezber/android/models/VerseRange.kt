package app.ezber.android.models

/** An inclusive from/to range of verse numbers within one surah. */
data class VerseRange(val start: Int, val end: Int) {

    val count: Int get() = maxOf(0, end - start + 1)

    val isEmpty: Boolean get() = count == 0

    /** The en dash is the product's display form ("1–5"). */
    val displayString: String get() = "$start–$end"

    fun contains(verseNumber: Int): Boolean = verseNumber in start..end

    /** Clamp both ends into `1..verseCount`, keeping start <= end. */
    fun clamped(verseCount: Int): VerseRange {
        val lower = minOf(maxOf(1, start), maxOf(1, verseCount))
        val upper = minOf(maxOf(lower, end), maxOf(1, verseCount))
        return VerseRange(lower, upper)
    }

    companion object {
        /** The default drill range: a short section of up to five verses. */
        fun short(start: Int = 1, verseCount: Int): VerseRange {
            val clampedStart = minOf(maxOf(1, start), maxOf(1, verseCount))
            val clampedEnd = minOf(clampedStart + 4, maxOf(1, verseCount))
            return VerseRange(clampedStart, maxOf(clampedStart, clampedEnd))
        }
    }
}
