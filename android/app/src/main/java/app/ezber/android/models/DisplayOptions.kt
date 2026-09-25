package app.ezber.android.models

/**
 * Per-preset display and playback preferences.
 *
 * [showTransliteration], [showArabic], [showTranslation], [pauseBetweenRepeatsMs]
 * and [playbackMode] map to columns on `presets` in schema/user_schema.sql.
 * [translationMode], [transliterationStyle] and [loopUntilStopped] have no
 * column there, so the Android store keeps them in the `settings` key/value
 * table beside the preset row (see SqliteUserDataStore).
 */
data class DisplayOptions(
    val showTransliteration: Boolean = true,
    val showArabic: Boolean = false,
    val showTranslation: Boolean = true,
    val translationMode: TranslationMode = TranslationMode.TAP_TO_REVEAL,
    val transliterationStyle: TransliterationStyle = TransliterationStyle.STANDARD,
    val pauseBetweenRepeatsMs: Int = 500,
    val loopUntilStopped: Boolean = false,
    val playbackMode: PlaybackMode = PlaybackMode.AYAH,
)

enum class TranslationMode(val label: String) {
    TAP_TO_REVEAL("Tap to reveal"),
    ALWAYS_SHOWN("Always shown"),
    HIDDEN_DURING_PLAYBACK("Hidden during playback"),
    ;

    companion object {
        fun fromName(name: String?): TranslationMode =
            entries.firstOrNull { it.name == name } ?: TAP_TO_REVEAL
    }
}

enum class TransliterationStyle(val label: String) {
    STANDARD("Standard"),
    SIMPLIFIED("Simplified"),
    ;

    companion object {
        fun fromName(name: String?): TransliterationStyle =
            entries.firstOrNull { it.name == name } ?: STANDARD
    }
}

/** Maps to `presets.playback_mode` ('ayah' | 'chapter'). */
enum class PlaybackMode(val schemaValue: String, val label: String) {
    AYAH("ayah", "Verse by verse"),
    CHAPTER("chapter", "Whole chapter"),
    ;

    companion object {
        fun fromSchema(value: String?): PlaybackMode =
            entries.firstOrNull { it.schemaValue == value } ?: AYAH
    }
}

/** Maps to `presets.download_scope` ('inherit' | 'surah' | 'preset'). */
enum class DownloadScope(val schemaValue: String, val label: String) {
    INHERIT("inherit", "Use app default"),
    SURAH("surah", "Whole surah"),
    PRESET("preset", "Preset range only"),
    ;

    companion object {
        fun fromSchema(value: String?): DownloadScope =
            entries.firstOrNull { it.schemaValue == value } ?: INHERIT
    }
}
