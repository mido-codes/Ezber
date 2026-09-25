package app.ezber.android.features.presetbuilder

import app.ezber.android.AppSettings
import app.ezber.android.models.DisplayOptions
import app.ezber.android.models.DownloadScope
import app.ezber.android.models.Iso8601
import app.ezber.android.models.PlaybackMode
import app.ezber.android.models.Preset
import app.ezber.android.models.Reciter
import app.ezber.android.models.RepeatPlan
import app.ezber.android.models.Surah
import app.ezber.android.models.TranslationMode
import app.ezber.android.models.TransliterationStyle
import app.ezber.android.models.VerseRange

/** Routes into the preset builder: a fresh draft or an existing preset being edited. */
sealed interface PresetBuilderRoute {
    data class New(val surahId: Int? = null, val range: VerseRange? = null) : PresetBuilderRoute
    data class Edit(val presetId: Long) : PresetBuilderRoute
}

/**
 * Mutable editing state for the preset builder. Converted to a [Preset] on
 * save so the model stays immutable-ish at the store boundary.
 */
data class PresetDraft(
    val name: String = "",
    val surahId: Int = 1,
    val range: VerseRange = VerseRange(1, 5),
    val defaultRepeats: Int = 5,
    val overrides: Map<Int, Int> = emptyMap(),
    val reciterId: Int = 0,
    val showTransliteration: Boolean = true,
    val showArabic: Boolean = false,
    val showTranslation: Boolean = true,
    val translationMode: TranslationMode = TranslationMode.TAP_TO_REVEAL,
    val transliterationStyle: TransliterationStyle = TransliterationStyle.STANDARD,
    val pauseBetweenRepeatsMs: Int = 500,
    val loopUntilStopped: Boolean = false,
    val playbackMode: PlaybackMode = PlaybackMode.AYAH,
    val downloadScope: DownloadScope = DownloadScope.INHERIT,
) {
    val repeats: RepeatPlan get() = RepeatPlan(defaultRepeats, overrides)

    val verseNumbers: List<Int>
        get() = if (range.end >= range.start) (range.start..range.end).toList() else emptyList()

    fun updateRepeat(value: Int, verseNumber: Int): PresetDraft =
        copy(overrides = repeats.withRepeats(value, verseNumber).overrides)

    fun defaultName(surah: Surah): String = "${surah.nameLatin} ${range.displayString}"

    fun makePreset(existing: Preset?, surah: Surah): Preset {
        val now = Iso8601.now()
        val trimmedName = name.trim()
        return Preset(
            id = existing?.id ?: 0L,
            name = trimmedName.ifEmpty { defaultName(surah) },
            surahId = surahId,
            range = range,
            repeats = repeats,
            reciterId = reciterId.takeIf { it != 0 },
            transliterationId = existing?.transliterationId,
            translationId = existing?.translationId,
            display = DisplayOptions(
                showTransliteration = showTransliteration,
                showArabic = showArabic,
                showTranslation = showTranslation,
                translationMode = translationMode,
                transliterationStyle = transliterationStyle,
                pauseBetweenRepeatsMs = pauseBetweenRepeatsMs,
                loopUntilStopped = loopUntilStopped,
                playbackMode = playbackMode,
            ),
            downloadScope = downloadScope,
            createdAt = existing?.createdAt ?: now,
            updatedAt = now,
            lastUsedAt = existing?.lastUsedAt,
        )
    }

    /** Clamp the range to the surah and drop overrides outside it. */
    fun clamp(verseCount: Int): PresetDraft {
        val clampedRange = range.clamped(verseCount)
        val valid = if (clampedRange.end >= clampedRange.start) {
            (clampedRange.start..clampedRange.end).toSet()
        } else {
            emptySet()
        }
        return copy(
            range = clampedRange,
            overrides = overrides.filterKeys { it in valid },
        )
    }

    companion object {
        fun from(preset: Preset): PresetDraft = PresetDraft(
            name = preset.name,
            surahId = preset.surahId ?: 1,
            range = preset.range,
            defaultRepeats = preset.repeats.defaultRepeats,
            overrides = preset.repeats.overrides,
            reciterId = preset.reciterId ?: 0,
            showTransliteration = preset.display.showTransliteration,
            showArabic = preset.display.showArabic,
            showTranslation = preset.display.showTranslation,
            translationMode = preset.display.translationMode,
            transliterationStyle = preset.display.transliterationStyle,
            pauseBetweenRepeatsMs = preset.display.pauseBetweenRepeatsMs,
            loopUntilStopped = preset.display.loopUntilStopped,
            playbackMode = preset.display.playbackMode,
            downloadScope = preset.downloadScope,
        )

        fun new(
            surahId: Int?,
            range: VerseRange?,
            settings: AppSettings,
            reciters: List<Reciter>,
        ): PresetDraft {
            val defaultValue = settings.defaultReciterId.takeIf { it != 0 }
                ?: reciters.firstOrNull()?.id
                ?: 0
            return PresetDraft(
                surahId = surahId ?: 1,
                range = range ?: VerseRange(1, 5),
                defaultRepeats = 5,
                reciterId = defaultValue,
                showArabic = settings.defaultShowArabic,
                translationMode = settings.defaultTranslationMode,
                transliterationStyle = settings.defaultTransliterationStyle,
                pauseBetweenRepeatsMs = settings.defaultPauseBetweenRepeatsMs,
                loopUntilStopped = settings.defaultLoopUntilStopped,
            )
        }
    }
}
