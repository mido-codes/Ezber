package app.ezber.android.models

/**
 * Identifies a single verse across the whole Quran, for example `55:3`.
 *
 * [reference] is the shared `verse_key` that schema/README.md calls the stable
 * cross-dataset identity.
 */
data class VerseId(val surah: Int, val number: Int) : Comparable<VerseId> {

    val reference: String get() = "$surah:$number"

    override fun toString(): String = reference

    override fun compareTo(other: VerseId): Int =
        if (surah != other.surah) surah.compareTo(other.surah) else number.compareTo(other.number)

    companion object {
        fun parse(verseKey: String): VerseId {
            val parts = verseKey.split(":")
            require(parts.size == 2) { "verse_key must look like \"55:3\", got \"$verseKey\"" }
            return VerseId(parts[0].toInt(), parts[1].toInt())
        }
    }
}

/**
 * A verse with its reading surfaces. Arabic is secondary; transliteration is
 * the primary reading surface for this audience.
 */
data class Verse(
    val surahId: Int,
    val number: Int,
    val arabic: String,
    val transliteration: String,
    val translations: List<Translation> = emptyList(),
    /** Canonical Quran-wide `ayahs.id`; 0 until resolved from the content cache. */
    val ayahId: Int = 0,
) {
    val id: VerseId get() = VerseId(surahId, number)
    val reference: String get() = "$surahId:$number"
}

/**
 * One translation attached to a verse. Translation editions are reserved and
 * empty in the shipped content bundle (captain decision 2026-09-25), so this is
 * carried for a future cleared edition.
 */
data class Translation(
    val id: String,
    val translator: String,
    val languageCode: String,
    val text: String,
)
