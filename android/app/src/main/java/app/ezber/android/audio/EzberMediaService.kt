package app.ezber.android.audio

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import app.ezber.android.EzberApplication
import app.ezber.android.MainActivity
import app.ezber.android.R
import app.ezber.android.models.DrillQueue
import app.ezber.android.services.DrillAudioItem
import app.ezber.android.services.DrillSessionMetadata
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The Media3 session host: one ExoPlayer in a `MediaLibraryService` with the
 * `mediaPlayback` foreground service, the MediaStyle notification and the
 * browsable library Android Auto and the lock screen talk to.
 *
 * The player plays exactly what the app's drill engine (or a car browse
 * selection) sets: one [MediaItem] per verse repetition, with `verse_key`,
 * repeat number and preset in the item metadata, so next/previous transport
 * moves repeat by repeat everywhere. Audio focus handling is on (ExoPlayer
 * ducks under navigation and pauses for calls); `handleAudioBecomingNoisy`
 * pauses when headphones are unplugged.
 *
 * Browsing root → presets lives here too; selecting a preset expands its
 * verse × repetition plan through the content manifest and starts the drill,
 * so Android Auto gets the same queue the in-app study player would build.
 */
@UnstableApi
class EzberMediaService : MediaLibraryService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var exoPlayer: ExoPlayer? = null
    private var librarySession: MediaLibrarySession? = null

    private val app get() = (application as EzberApplication).environment

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        exoPlayer = player

        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this)
                .setChannelId(NOTIFICATION_CHANNEL_ID)
                .setChannelName(R.string.notification_channel_playback)
                .build(),
        )

        librarySession = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(
                PendingIntent.getActivity(
                    this,
                    0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            )
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        librarySession

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = exoPlayer
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            pauseAllPlayersAndStopSelf()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        librarySession?.release()
        librarySession = null
        exoPlayer?.release()
        exoPlayer = null
        super.onDestroy()
    }

    // MARK: - Library browsing

    private inner class LibraryCallback : MediaLibrarySession.Callback {

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(
                LibraryResult.ofItem(DrillMedia.rootBrowseItem(getString(R.string.app_name)), params),
            )

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
            Futures.immediateFuture(LibraryResult.ofItemList(childrenOf(parentId), params))

        override fun onAddMediaItems(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: List<MediaItem>,
        ): ListenableFuture<List<MediaItem>> {
            val future = SettableFuture.create<List<MediaItem>>()
            scope.launch {
                try {
                    future.set(resolvePlayable(mediaItems))
                } catch (error: Exception) {
                    future.setException(error)
                }
            }
            return future
        }
    }

    private fun childrenOf(parentId: String): ImmutableList<MediaItem> {
        if (parentId != DrillMedia.ROOT_MEDIA_ID) return ImmutableList.of()
        return try {
            val environment = app
            ImmutableList.copyOf(
                environment.userData.allPresets().map { preset ->
                    DrillMedia.presetBrowseItem(
                        preset = preset,
                        surah = preset.surahId?.let { environment.content.surah(it) },
                    )
                },
            )
        } catch (_: Exception) {
            ImmutableList.of()
        }
    }

    private suspend fun resolvePlayable(mediaItems: List<MediaItem>): List<MediaItem> {
        val resolved = mutableListOf<MediaItem>()
        for (mediaItem in mediaItems) {
            val presetId = DrillMedia.presetIdFromMediaId(mediaItem.mediaId)
            if (presetId == null) {
                resolved += mediaItem
            } else {
                resolved += resolvePreset(presetId)
            }
        }
        return resolved
    }

    private suspend fun resolvePreset(presetId: Long): List<MediaItem> {
        val environment = app
        val preset = environment.userData.preset(presetId)
            ?: throw IOException("The preset no longer exists")
        val surah = preset.surahId?.let { environment.content.surah(it) }
            ?: throw IOException("The preset has no surah")
        val verses = environment.content.verses(surah.id, preset.range)
        val queue = DrillQueue.build(preset = preset, surah = surah, verses = verses)
        if (queue.isEmpty) throw IOException("The preset has no verses to play")
        val reciterId = preset.reciterId ?: throw IOException("The preset has no reciter")
        val reciter = environment.content.reciter(reciterId)

        val resolver = DrillAudioResolver(environment.content, environment.audioCache)
        val resolved = LinkedHashMap<String, ResolvedVerseAudio>()
        for (verse in queue.items.map { it.verse }.distinctBy { it.reference }) {
            resolved[verse.reference] = resolver.resolve(reciterId, verse.surahId, verse.number)
        }

        val metadata = DrillSessionMetadata(
            presetName = preset.name,
            surahName = surah.nameLatin,
            reciterId = reciterId,
            reciterName = reciter?.name,
        )
        return queue.items.map { item ->
            val audio = resolved.getValue(item.verse.reference)
            val verseKey = item.verse.reference
            val payload = DrillAudioItem(
                id = item.id,
                uri = audio.uri.toString(),
                mediaId = DrillMedia.drillMediaId(presetId, item),
                verseKey = verseKey,
                repeatIndex = item.repeatIndex,
                mimeType = audio.mimeType,
                title = "${metadata.surahName} $verseKey",
                subtitle = "Repeat ${item.repeatIndex} of ${item.repeatCount}",
                albumTitle = preset.name,
                artist = metadata.reciterName,
                extras = mapOf(
                    DrillMedia.EXTRA_PRESET_ID to presetId.toString(),
                    DrillMedia.EXTRA_VERSE_KEY to verseKey,
                    DrillMedia.EXTRA_VERSE_NUMBER to item.verse.number.toString(),
                    DrillMedia.EXTRA_REPEAT_INDEX to item.repeatIndex.toString(),
                    DrillMedia.EXTRA_REPEAT_COUNT to item.repeatCount.toString(),
                ),
            )
            payload.toMediaItem()
        }
    }

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "ezber_playback"
    }
}
