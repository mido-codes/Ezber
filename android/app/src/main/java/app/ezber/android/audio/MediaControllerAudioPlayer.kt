package app.ezber.android.audio

import android.content.ComponentName
import android.content.Context
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.ezber.android.services.AudioPlayer
import app.ezber.android.services.DrillAudioItem
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.CopyOnWriteArrayList

/**
 * [AudioPlayer] backed by a Media3 [MediaController] talking to
 * [EzberMediaService]. The service owns the actual ExoPlayer, so playback
 * survives the screen and the lock screen / Android Auto see the same session.
 *
 * The controller connects lazily on the first command (so no service is bound
 * until a drill actually loads) and queues commands issued before the
 * connection resolves. All callbacks arrive on the main looper, matching the
 * drill engine's dispatcher.
 */
@OptIn(UnstableApi::class)
class MediaControllerAudioPlayer(context: Context) : AudioPlayer {

    private val applicationContext: Context = context.applicationContext

    private val pendingCommands = mutableListOf<(MediaController) -> Unit>()
    private val listeners = CopyOnWriteArrayList<AudioPlayer.Listener>()
    private val playerListeners = LinkedHashMap<AudioPlayer.Listener, Player.Listener>()

    private var controller: MediaController? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var released = false

    private val executor by lazy { ContextCompat.getMainExecutor(applicationContext) }

    val isConnected: Boolean get() = controller != null

    private fun ensureConnected() {
        if (controller != null || controllerFuture != null || released) return
        val token = SessionToken(
            applicationContext,
            ComponentName(applicationContext, EzberMediaService::class.java),
        )
        val future = MediaController.Builder(applicationContext, token).buildAsync()
        controllerFuture = future
        future.addListener(
            {
                val connected = runCatching { future.get() }.getOrNull() ?: return@addListener
                if (released) {
                    connected.release()
                    return@addListener
                }
                controller = connected
                playerListeners.values.forEach(connected::addListener)
                val queued = pendingCommands.toList()
                pendingCommands.clear()
                queued.forEach { command -> command(connected) }
            },
            executor,
        )
    }

    private fun withController(command: (MediaController) -> Unit) {
        val connected = controller
        if (connected != null) {
            command(connected)
        } else {
            pendingCommands.add(command)
            ensureConnected()
        }
    }

    override val state: AudioPlayer.State
        get() = controller?.let { mapState(it.playbackState) } ?: AudioPlayer.State.IDLE

    override val isPlaying: Boolean
        get() = controller?.isPlaying == true

    override val currentMediaItemIndex: Int
        get() = controller?.currentMediaItemIndex ?: 0

    override val currentPositionMs: Long
        get() = controller?.currentPosition ?: 0L

    override val bufferedPositionMs: Long
        get() = controller?.bufferedPosition ?: 0L

    override fun setMediaItems(items: List<DrillAudioItem>) {
        val mediaItems = items.map { it.toMediaItem() }
        withController { it.setMediaItems(mediaItems) }
    }

    override fun prepare() {
        withController { it.prepare() }
    }

    override fun play() {
        withController { it.play() }
    }

    override fun pause() {
        withController { it.pause() }
    }

    override fun seekTo(mediaItemIndex: Int, positionMs: Long) {
        withController { it.seekTo(mediaItemIndex, positionMs) }
    }

    override fun setLooping(looping: Boolean) {
        val mode = if (looping) Player.REPEAT_MODE_ALL else Player.REPEAT_MODE_OFF
        withController { it.repeatMode = mode }
    }

    override fun release() {
        released = true
        pendingCommands.clear()
        listeners.clear()
        val connected = controller
        if (connected != null) {
            playerListeners.values.forEach(connected::removeListener)
            connected.release()
        }
        playerListeners.clear()
        controller = null
        controllerFuture?.let { future ->
            if (future.isDone) runCatching { future.get().release() }
        }
        controllerFuture = null
    }

    override fun addListener(listener: AudioPlayer.Listener) {
        if (!listeners.addIfAbsent(listener)) return
        val adapter = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                listener.onPlaybackStateChanged(mapState(playbackState))
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                listener.onIsPlayingChanged(isPlaying)
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                listener.onMediaItemTransition(mediaItem?.toDrillAudioItem(), mapReason(reason))
            }
        }
        playerListeners[listener] = adapter
        controller?.addListener(adapter)
    }

    override fun removeListener(listener: AudioPlayer.Listener) {
        listeners.remove(listener)
        playerListeners.remove(listener)?.let { adapter ->
            controller?.removeListener(adapter)
        }
    }

    private fun mapState(playbackState: Int): AudioPlayer.State = when (playbackState) {
        Player.STATE_IDLE -> AudioPlayer.State.IDLE
        Player.STATE_BUFFERING -> AudioPlayer.State.BUFFERING
        Player.STATE_READY -> AudioPlayer.State.READY
        Player.STATE_ENDED -> AudioPlayer.State.ENDED
        else -> AudioPlayer.State.IDLE
    }

    private fun mapReason(reason: Int): Int = when (reason) {
        Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> AudioPlayer.REASON_AUTO
        Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> AudioPlayer.REASON_REPEAT
        Player.MEDIA_ITEM_TRANSITION_REASON_SEEK -> AudioPlayer.REASON_SEEK
        Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED ->
            AudioPlayer.REASON_PLAYLIST_CHANGED
        else -> AudioPlayer.REASON_PLAYLIST_CHANGED
    }
}
