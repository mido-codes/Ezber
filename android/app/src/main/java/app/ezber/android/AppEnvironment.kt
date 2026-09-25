package app.ezber.android

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import app.ezber.android.content.ContentRepository
import app.ezber.android.content.HttpContentFetcher
import app.ezber.android.persistence.ContentProviding
import app.ezber.android.persistence.InMemoryContentStore
import app.ezber.android.persistence.InMemoryUserDataStore
import app.ezber.android.persistence.SqliteContentStore
import app.ezber.android.persistence.SqliteUserDataStore
import app.ezber.android.persistence.UserDataStore
import app.ezber.android.services.AudioPlayer
import app.ezber.android.services.AudioSessionService
import app.ezber.android.services.DrillSessionService
import app.ezber.android.services.StubAudioPlayer
import app.ezber.android.services.StubAudioSessionService
import app.ezber.android.services.StubDrillSessionService
import app.ezber.android.services.StubVoiceMemoService
import app.ezber.android.services.VoiceMemoService

/**
 * One object owns the stores and services for the whole app, created once in
 * [EzberApplication] and passed down through composables. Views never
 * construct their own stores.
 */
class AppEnvironment(
    val content: ContentProviding,
    val userData: UserDataStore,
    val audioSession: AudioSessionService,
    val audioPlayer: AudioPlayer,
    val drillSession: DrillSessionService,
    val voiceMemo: VoiceMemoService,
    val settings: AppSettings,
    val contentStoreDescription: String,
    val userStoreDescription: String,
    /** Lazily fills [content] from the web bundle; null in previews. */
    val contentRepository: ContentRepository? = null,
) {

    /** Bumped whenever user data changes so list screens refresh. */
    var dataRevision by mutableIntStateOf(0)
        private set

    fun notifyDataChanged() {
        dataRevision++
    }

    fun bootstrap() {
        audioSession.configure()
    }

    companion object {
        /** The real environment: SQLite stores plus the lazy HTTP content cache. */
        fun live(context: Context): AppEnvironment {
            val settings = AppSettings.from(context)
            val contentStore = SqliteContentStore(context)
            val contentRepository = ContentRepository(
                store = contentStore,
                fetcher = HttpContentFetcher(),
                baseUrl = { settings.contentBaseUrl },
            )

            val sqliteUser = try {
                SqliteUserDataStore(context).also { it.allPresets() }
            } catch (_: Exception) {
                null
            }
            val userData: UserDataStore = sqliteUser ?: InMemoryUserDataStore()

            return AppEnvironment(
                content = contentStore,
                userData = userData,
                audioSession = StubAudioSessionService(),
                audioPlayer = StubAudioPlayer(),
                drillSession = StubDrillSessionService(),
                voiceMemo = StubVoiceMemoService(),
                settings = settings,
                contentStoreDescription = "HTTP cache · ezber-content.sqlite",
                userStoreDescription = if (sqliteUser != null) {
                    "SQLite · ezber-user.sqlite"
                } else {
                    "In-memory fallback (user database unavailable)"
                },
                contentRepository = contentRepository,
            )
        }

        /** Empty environment used by Compose previews; no network is touched. */
        fun preview(context: Context): AppEnvironment = AppEnvironment(
            content = InMemoryContentStore(),
            userData = InMemoryUserDataStore(),
            audioSession = StubAudioSessionService(),
            audioPlayer = StubAudioPlayer(),
            drillSession = StubDrillSessionService(),
            voiceMemo = StubVoiceMemoService(),
            settings = AppSettings.forPreview(context),
            contentStoreDescription = "In-memory · preview",
            userStoreDescription = "In-memory · preview",
        )
    }
}
