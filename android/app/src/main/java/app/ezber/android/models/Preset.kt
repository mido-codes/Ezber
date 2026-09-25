package app.ezber.android.models

/**
 * A saved drill definition: surah and section, per-verse repeats, reciter and
 * display options. Field-for-field the `presets` row in
 * schema/user_schema.sql, plus the optional per-verse overrides from
 * `preset_verses`.
 *
 * `id == 0L` means "not saved yet"; the store assigns the row id on insert.
 */
data class Preset(
    val id: Long = 0L,
    val name: String,
    val surahId: Int?,
    val range: VerseRange,
    val repeats: RepeatPlan = RepeatPlan(),
    val reciterId: Int? = null,
    val transliterationId: Int? = null,
    val translationId: Int? = null,
    val display: DisplayOptions = DisplayOptions(),
    val downloadScope: DownloadScope = DownloadScope.INHERIT,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val lastUsedAt: String? = null,
) {
    val repeatSummary: String
        get() = if (repeats.overrides.isEmpty()) {
            "${repeats.defaultRepeats}× each"
        } else {
            "${repeats.defaultRepeats}× each · ${repeats.overrides.size} override" +
                if (repeats.overrides.size == 1) "" else "s"
        }

    val totalRepetitions: Int get() = repeats.totalRepetitions(range)
}

/**
 * How many times each verse repeats. [overrides] holds per-verse exceptions to
 * [defaultRepeats]; the store writes them to `preset_verses`.
 */
data class RepeatPlan(
    val defaultRepeats: Int = 5,
    val overrides: Map<Int, Int> = emptyMap(),
) {
    fun repeatsFor(verseNumber: Int): Int = maxOf(1, overrides[verseNumber] ?: defaultRepeats)

    fun totalRepetitions(range: VerseRange): Int {
        if (range.isEmpty) return 0
        return (range.start..range.end).sumOf { repeatsFor(it) }
    }

    /** Immutable edit used by the preset builder: 1..99, default removes the override. */
    fun withRepeats(value: Int, verseNumber: Int): RepeatPlan {
        val clamped = value.coerceIn(1, 99)
        val updated = overrides.toMutableMap()
        if (clamped == defaultRepeats) {
            updated.remove(verseNumber)
        } else {
            updated[verseNumber] = clamped
        }
        return copy(overrides = updated)
    }
}
