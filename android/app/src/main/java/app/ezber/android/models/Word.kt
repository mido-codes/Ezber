package app.ezber.android.models

/**
 * One word of an ayah (`words` row in schema/content_schema.sql), used for the
 * active-word reading surface. `arabic` is only set when the pipeline's token
 * count matched the Uthmani word count, so it may be absent.
 */
data class VerseWord(
    val ayahId: Int,
    val position: Int,
    val transliteration: String,
    val arabic: String? = null,
    val translation: String? = null,
)

/**
 * One word-timing range (`segments` row). `wordIndex = 0` is the whole-ayah
 * range; `>= 1` maps to [VerseWord.position]. Times are offsets inside that
 * ayah's audio file.
 */
data class WordSegment(
    val ayahId: Int,
    val wordIndex: Int,
    val startMs: Long,
    val endMs: Long,
) {
    val isWholeAyah: Boolean get() = wordIndex == 0
}
