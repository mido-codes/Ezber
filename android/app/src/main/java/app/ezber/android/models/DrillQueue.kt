package app.ezber.android.models

/**
 * One entry in the drill: a specific repetition of a specific verse. A drill
 * is exactly this queue, so the UI can always show where the listener is and
 * how to resume.
 */
data class DrillItem(
    val verse: Verse,
    val repeatIndex: Int,
    val repeatCount: Int,
) {
    val id: String get() = "${verse.reference}#$repeatIndex"
    val isFirstRepeat: Boolean get() = repeatIndex <= 1
    val isLastRepeat: Boolean get() = repeatIndex >= repeatCount
}

/** The verse × repetition queue built from a preset. */
data class DrillQueue(
    val presetId: Long,
    val surah: Surah,
    val items: List<DrillItem>,
) {
    val isEmpty: Boolean get() = items.isEmpty()
    val count: Int get() = items.size

    /** Verse numbers in play order, without duplicates. */
    val verseNumbers: List<Int> get() = items.map { it.verse.number }.distinct()

    /** First queue index at or after the given resume point. */
    fun indexForResume(point: ResumePoint): Int? = items.indexOfFirst { item ->
        item.verse.number > point.verseNumber ||
            (item.verse.number == point.verseNumber && item.repeatIndex >= point.repeatIndex)
    }

    fun firstIndexOfVerse(number: Int): Int? = items.indexOfFirst { it.verse.number == number }

    fun firstIndexOfVerseAfter(number: Int): Int? = items.indexOfFirst { it.verse.number > number }

    fun firstIndexOfVerseBefore(number: Int): Int? = items.indexOfLast { it.verse.number < number }

    companion object {
        fun build(preset: Preset, surah: Surah, verses: List<Verse>): DrillQueue {
            val selected = verses
                .filter { it.surahId == preset.surahId && preset.range.contains(it.number) }
                .sortedBy { it.number }

            val items = buildList {
                for (verse in selected) {
                    val repeats = maxOf(1, preset.repeats.repeatsFor(verse.number))
                    for (repeatIndex in 1..repeats) {
                        add(
                            DrillItem(
                                verse = verse,
                                repeatIndex = repeatIndex,
                                repeatCount = repeats,
                            ),
                        )
                    }
                }
            }
            return DrillQueue(presetId = preset.id, surah = surah, items = items)
        }
    }
}
