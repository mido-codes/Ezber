package app.ezber.android

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import app.ezber.android.audio.AudioCache
import app.ezber.android.audio.MediaAudioSessionService
import app.ezber.android.audio.MediaControllerAudioPlayer
import app.ezber.android.audio.MediaDrillSessionService
import app.ezber.android.models.PlanState
import app.ezber.android.persistence.ContentProviding
import app.ezber.android.persistence.InMemoryContentStore
import app.ezber.android.persistence.InMemoryUserDataStore
import app.ezber.android.persistence.SqliteContentStore
import app.ezber.android.persistence.SqliteUserDataStore
import app.ezber.android.persistence.UserDataStore
import app.ezber.android.placeholder.PlaceholderContent
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
    val audioCache: AudioCache,
) {

    /** Bumped whenever user data changes so list screens refresh. */
    var dataRevision by mutableIntStateOf(0)
        private set

    fun notifyDataChanged() {
        dataRevision++
    }

    fun bootstrap() {
        seedIfNeeded()
        audioSession.configure()
    }

    private fun seedIfNeeded() {
        if (userData.settingValue(SEED_KEY) == "1") return

        for (preset in PlaceholderContent.seededPresets) {
            userData.savePreset(preset)
        }
        for (entry in PlaceholderContent.seededProgress) {
            userData.saveProgress(entry)
        }
        for (note in PlaceholderContent.seededNotes) {
            userData.saveNote(note)
        }
        PlaceholderContent.seededPresets.firstOrNull()?.let { first ->
            userData.setLastPresetId(first.id)
            userData.savePlanState(
                PlanState(
                    presetId = first.id,
                    planIndex = 6,
                    positionMs = 0L,
                    repetitionCountersJson = null,
                ),
            )
        }
        userData.setSettingValue(SEED_KEY, "1")
        notifyDataChanged()
    }

    companion object {
        private const val SEED_KEY = "seed.placeholder"

        /** The real environment: SQLite when available, placeholder data otherwise. */
        fun live(context: Context): AppEnvironment {
            val sqliteContent = SqliteContentStore.openDefault(context)
            val content: ContentProviding = sqliteContent ?: InMemoryContentStore()

            val sqliteUser = try {
                SqliteUserDataStore(context).also { it.allPresets() }
            } catch (_: Exception) {
                null
            }
            val userData: UserDataStore = sqliteUser ?: InMemoryUserDataStore()

            val appContext = context.applicationContext
            val audioCache = AudioCache(appContext)
            val mediaPlayer = MediaControllerAudioPlayer(appContext)

            return AppEnvironment(
                content = content,
                userData = userData,
                audioSession = MediaAudioSessionService(mediaPlayer),
                audioPlayer = mediaPlayer,
                drillSession = MediaDrillSessionService(
                    content = content,
                    cache = audioCache,
                    player = mediaPlayer,
                ),
                voiceMemo = StubVoiceMemoService(),
                settings = AppSettings.from(context),
                contentStoreDescription = if (sqliteContent != null) {
                    "SQLite · ezber-content.sqlite"
                } else {
                    "Placeholder · content pipeline pending"
                },
                userStoreDescription = if (sqliteUser != null) {
                    "SQLite · ezber-user.sqlite"
                } else {
                    "In-memory fallback"
                },
                audioCache = audioCache,
            )
        }

        /** Seeded environment used by Compose previews. */
        fun preview(context: Context): AppEnvironment = AppEnvironment(
            content = InMemoryContentStore(),
            userData = InMemoryUserDataStore.seeded(),
            audioSession = StubAudioSessionService(),
            audioPlayer = StubAudioPlayer(),
            drillSession = StubDrillSessionService(),
            voiceMemo = StubVoiceMemoService(),
            settings = AppSettings.forPreview(context),
            contentStoreDescription = "Placeholder · preview",
            userStoreDescription = "In-memory · preview",
            audioCache = AudioCache(context.applicationContext),
        )
    }
}
