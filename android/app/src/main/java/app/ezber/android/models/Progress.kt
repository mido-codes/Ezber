package app.ezber.android.models

/**
 * Per-(preset, verse) memorization state. The values are exactly the ones the
 * `progress.memorization_state` CHECK constraint allows in
 * schema/user_schema.sql: 'learning', 'review', 'memorized'.
 *
 * A verse with no `progress` row is shown as "New"; there is no stored new
 * state, which keeps "never drilled" honest.
 */
enum class MemorizationState(val label: String, val explanation: String) {
    LEARNING("Learning", "Fewer than 10 repetitions."),
    REVIEW("Review", "10–29 repetitions; still consolidating."),
    MEMORIZED("Memorized", "30 or more repetitions."),
    ;

    companion object {
        fun fromSchema(value: String?): MemorizationState =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: LEARNING

        /**
         * Provisional thresholds. Keep this the only place the app derives a
         * state from a repetition count; the shared schema may define its own
         * mapping later.
         */
        fun derived(repetitions: Int): MemorizationState = when {
            repetitions < 10 -> LEARNING
            repetitions < 30 -> REVIEW
            else -> MEMORIZED
        }
    }
}

/** One `progress` row: exposure for one preset's take on one verse. */
data class VerseProgress(
    val presetId: Long,
    val verseId: VerseId,
    val repetitionsDone: Int = 0,
    val state: MemorizationState = MemorizationState.LEARNING,
    val lastPlayedAt: String? = null,
    val nextReviewAt: String? = null,
)

/** One verse across every preset that has touched it. */
data class VerseSummary(
    val verseId: VerseId,
    val repetitions: Int,
    val exposureCount: Int,
    val lastPlayedAt: String?,
) {
    val state: MemorizationState get() = MemorizationState.derived(repetitions)
}

/**
 * Rolls per-(preset, verse) progress rows up to one entry per verse. The
 * progress screens show honest exposure across presets; `progress` itself
 * stays keyed by (preset_id, ayah) as schema/user_schema.sql requires.
 */
fun List<VerseProgress>.summarizeByVerse(): List<VerseSummary> =
    groupBy { it.verseId }
        .map { (verseId, rows) ->
            VerseSummary(
                verseId = verseId,
                repetitions = rows.sumOf { it.repetitionsDone },
                exposureCount = rows.size,
                lastPlayedAt = rows.mapNotNull { it.lastPlayedAt }.maxOrNull(),
            )
        }
        .sortedWith(compareBy({ it.verseId.surah }, { it.verseId.number }))
