package app.ezber.android

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.ezber.android.models.TranslationMode
import app.ezber.android.models.TransliterationStyle
import java.util.Locale

/**
 * User preferences, persisted to SharedPreferences. English-first: the device
 * language picks the default (falling back to English), and the learner can
 * switch to Turkish.
 *
 * These are app-level defaults; a preset carries its own copies once created.
 * The content cache size and sync state live in ContentRepository instead.
 */
class AppSettings(private val preferences: SharedPreferences) {

    var language by mutableStateOf(
        AppLanguage.fromTag(readString(KEY_LANGUAGE) ?: Locale.getDefault().language),
    )
        private set

    var themeMode by mutableStateOf(AppThemeMode.fromName(readString(KEY_THEME)))
        private set

    /** 0 means "no default chosen yet"; callers fall back to the first reciter. */
    var defaultReciterId by mutableStateOf(
        preferences.getInt(KEY_DEFAULT_RECITER, DEFAULT_RECITER_ID_UNSET)
            .takeIf { it > 0 } ?: 0,
    )
        private set

    var defaultShowArabic by mutableStateOf(preferences.getBoolean(KEY_DEFAULT_SHOW_ARABIC, false))
        private set

    var defaultTransliterationStyle by mutableStateOf(
        TransliterationStyle.fromName(readString(KEY_DEFAULT_TRANSLITERATION_STYLE)),
    )
        private set

    var defaultTranslationMode by mutableStateOf(
        TranslationMode.fromName(readString(KEY_DEFAULT_TRANSLATION_MODE)),
    )
        private set

    var defaultPauseBetweenRepeatsMs by mutableStateOf(
        preferences.getInt(KEY_DEFAULT_PAUSE_MS, 500),
    )
        private set

    var defaultLoopUntilStopped by mutableStateOf(
        preferences.getBoolean(KEY_DEFAULT_LOOP, false),
    )
        private set

    var navigationBehavior by mutableStateOf(
        NavigationBehavior.fromName(readString(KEY_NAVIGATION_BEHAVIOR)),
    )
        private set

    var callBehavior by mutableStateOf(
        CallBehavior.fromName(readString(KEY_CALL_BEHAVIOR)),
    )
        private set

    /** Base URL of the web content bundle; see [DEFAULT_CONTENT_BASE_URL]. */
    var contentBaseUrl by mutableStateOf(
        normalizeBaseUrl(readString(KEY_CONTENT_BASE_URL)) ?: DEFAULT_CONTENT_BASE_URL,
    )
        private set

    fun updateLanguage(value: AppLanguage) {
        language = value
        edit { putString(KEY_LANGUAGE, value.tag) }
    }

    fun updateThemeMode(value: AppThemeMode) {
        themeMode = value
        edit { putString(KEY_THEME, value.name) }
    }

    fun updateDefaultReciter(id: Int) {
        defaultReciterId = id
        edit { putInt(KEY_DEFAULT_RECITER, id) }
    }

    fun updateDefaultShowArabic(value: Boolean) {
        defaultShowArabic = value
        edit { putBoolean(KEY_DEFAULT_SHOW_ARABIC, value) }
    }

    fun updateDefaultTransliterationStyle(value: TransliterationStyle) {
        defaultTransliterationStyle = value
        edit { putString(KEY_DEFAULT_TRANSLITERATION_STYLE, value.name) }
    }

    fun updateDefaultTranslationMode(value: TranslationMode) {
        defaultTranslationMode = value
        edit { putString(KEY_DEFAULT_TRANSLATION_MODE, value.name) }
    }

    fun updateDefaultPauseBetweenRepeatsMs(value: Int) {
        defaultPauseBetweenRepeatsMs = value
        edit { putInt(KEY_DEFAULT_PAUSE_MS, value) }
    }

    fun updateDefaultLoopUntilStopped(value: Boolean) {
        defaultLoopUntilStopped = value
        edit { putBoolean(KEY_DEFAULT_LOOP, value) }
    }

    fun updateNavigationBehavior(value: NavigationBehavior) {
        navigationBehavior = value
        edit { putString(KEY_NAVIGATION_BEHAVIOR, value.name) }
    }

    fun updateCallBehavior(value: CallBehavior) {
        callBehavior = value
        edit { putString(KEY_CALL_BEHAVIOR, value.name) }
    }

    fun updateContentBaseUrl(value: String) {
        val normalized = normalizeBaseUrl(value) ?: DEFAULT_CONTENT_BASE_URL
        contentBaseUrl = normalized
        edit { putString(KEY_CONTENT_BASE_URL, normalized) }
    }

    private fun readString(key: String): String? = preferences.getString(key, null)

    private fun edit(block: SharedPreferences.Editor.() -> Unit) {
        preferences.edit().apply(block).apply()
    }

    companion object {
        /**
         * The dev default: the Android emulator reaches a web dev server on the
         * host at 10.0.2.2, and `npm run content:link` in `web/` serves the
         * pipeline's grouped export under `/content/`. Override it in Settings.
         */
        const val DEFAULT_CONTENT_BASE_URL = "http://10.0.2.2:3000/content/"

        fun from(context: Context): AppSettings =
            AppSettings(context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE))

        /** A throwaway store used by Compose previews. */
        fun forPreview(context: Context): AppSettings =
            AppSettings(context.getSharedPreferences(PREVIEW_FILE_NAME, Context.MODE_PRIVATE))

        /** Trims whitespace and guarantees one trailing slash; null when blank. */
        fun normalizeBaseUrl(value: String?): String? {
            val trimmed = value?.trim().orEmpty()
            if (trimmed.isEmpty()) return null
            return trimmed.trimEnd('/') + "/"
        }

        private const val FILE_NAME = "ezber-settings"
        private const val PREVIEW_FILE_NAME = "ezber-settings-preview"
        private const val DEFAULT_RECITER_ID_UNSET = -1

        private const val KEY_LANGUAGE = "settings.language"
        private const val KEY_THEME = "settings.themeMode"
        private const val KEY_DEFAULT_RECITER = "settings.defaultReciterId"
        private const val KEY_DEFAULT_SHOW_ARABIC = "settings.defaultShowArabic"
        private const val KEY_DEFAULT_TRANSLITERATION_STYLE = "settings.defaultTransliterationStyle"
        private const val KEY_DEFAULT_TRANSLATION_MODE = "settings.defaultTranslationMode"
        private const val KEY_DEFAULT_PAUSE_MS = "settings.defaultPauseBetweenRepeatsMs"
        private const val KEY_DEFAULT_LOOP = "settings.defaultLoopUntilStopped"
        private const val KEY_NAVIGATION_BEHAVIOR = "settings.navigationBehavior"
        private const val KEY_CALL_BEHAVIOR = "settings.callBehavior"
        private const val KEY_CONTENT_BASE_URL = "settings.contentBaseUrl"
    }
}

/** English-first language picker; Turkish is the alternate. */
enum class AppLanguage(val tag: String, val label: String) {
    ENGLISH("en", "English"),
    TURKISH("tr", "Türkçe"),
    ;

    companion object {
        fun fromTag(tag: String?): AppLanguage =
            entries.firstOrNull { it.tag == tag } ?: ENGLISH
    }
}

enum class AppThemeMode(val label: String) {
    SYSTEM("System"),
    LIGHT("Light"),
    DARK("Dark"),
    ;

    companion object {
        fun fromName(name: String?): AppThemeMode =
            entries.firstOrNull { it.name == name } ?: SYSTEM
    }
}

enum class NavigationBehavior(val label: String) {
    DUCK("Duck under prompts"),
    PAUSE("Pause for prompts"),
    KEEP_PLAYING("Keep playing"),
    ;

    companion object {
        fun fromName(name: String?): NavigationBehavior =
            entries.firstOrNull { it.name == name } ?: DUCK
    }
}

enum class CallBehavior(val label: String) {
    PAUSE_AND_RESUME("Pause, then resume"),
    PAUSE_ONLY("Pause, wait for me"),
    KEEP_PLAYING("Keep playing"),
    ;

    companion object {
        fun fromName(name: String?): CallBehavior =
            entries.firstOrNull { it.name == name } ?: PAUSE_AND_RESUME
    }
}
