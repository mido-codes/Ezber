package app.ezber.android.models

/** One of the 114 chapters of the Quran (content DB table `surahs`). */
data class Surah(
    val id: Int,
    val nameArabic: String,
    val nameLatin: String,
    val nameEnglish: String,
    val verseCount: Int,
    val revelationPlace: RevelationPlace,
    val bismillahPre: Boolean = true,
) {
    val subtitle: String get() = "$nameEnglish · $verseCount verses"
}

enum class RevelationPlace(val label: String) {
    MECCAN("Meccan"),
    MEDINAN("Medinan"),
    ;

    companion object {
        /** Maps content_schema.sql`s `revelation` ('Meccan' | 'Medinan'). */
        fun fromSchema(value: String?): RevelationPlace =
            if (value.equals("Medinan", ignoreCase = true)) MEDINAN else MECCAN
    }
}
