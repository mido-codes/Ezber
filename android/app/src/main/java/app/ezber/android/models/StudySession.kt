package app.ezber.android.models

/** Where the listener is in the verse × repetition queue. */
data class ResumePoint(val verseNumber: Int, val repeatIndex: Int) {
    init {
        require(repeatIndex >= 1) { "repeatIndex must be >= 1" }
    }
}

/**
 * A row in `sessions`: one run through a preset with its counters.
 * `plan_state` holds the exact resume position; this is the history record.
 */
data class StudySession(
    val id: Long = 0L,
    val presetId: Long,
    val startedAt: String,
    val endedAt: String? = null,
    val versesCovered: Int = 0,
    val repetitions: Int = 0,
    val interrupted: Boolean = false,
)

/**
 * The `plan_state` row for a preset: the exact resume position, written at
 * item (repeat) boundaries so a killed process resumes on the same repetition.
 */
data class PlanState(
    val presetId: Long,
    val planIndex: Int = 0,
    val positionMs: Long = 0L,
    val repetitionCountersJson: String? = null,
    val updatedAt: String? = null,
)
