package app.ezber.android.models

/**
 * A verse-scoped note (schema/user_schema.sql table `notes`).
 *
 * The shared schema keeps markdown in `body_md` with FTS5 search over it and
 * has no voice-memo columns in v1. A voice memo is therefore stored as a note
 * whose body records the pending transcript; [isVoiceMemo] is the display
 * marker for that convention.
 */
data class Note(
    val id: Long = 0L,
    val verseKey: String,
    val bodyMarkdown: String,
    val createdAt: String? = null,
    val updatedAt: String? = null,
) {
    val verseId: VerseId get() = VerseId.parse(verseKey)

    val isVoiceMemo: Boolean get() = bodyMarkdown.startsWith(VOICE_MEMO_PREFIX)

    val title: String get() = if (isVoiceMemo) "Voice memo" else "Note"

    companion object {
        const val VOICE_MEMO_PREFIX = "Voice memo (transcription pending)"
    }
}
