package app.ezber.android.services

/**
 * Background audio is intentionally Media3-shaped without depending on Media3:
 * the interfaces below mirror the slice of `androidx.media3.exoplayer.ExoPlayer`
 * and `androidx.media3.session.MediaSession` the app will use, so replacing
 * [StubAudioSessionService] / [StubAudioPlayer] with a real implementation is a
 * drop-in change and adds no Media3 dependency to this scaffold slice.
 *
 * The real implementation will wrap:
 *   * ExoPlayer + a MediaSessionService for playback that survives the screen,
 *   * AudioManager focus handling for ducking under navigation and calls,
 *   * a MediaSession for lock-screen / Android Auto metadata.
 */

/** One verse recording, the Media3 `MediaItem` analogue. */
data class DrillAudioItem(
    val id: String,
    val uri: String?,
    val mediaId: String,
    val verseKey: String,
    val repeatIndex: Int,
    val mimeType: String? = null,
)

/** Metadata the app would publish to the lock screen / Android Auto. */
data class NowPlayingInfo(
    val title: String,
    val subtitle: String,
    val albumTitle: String,
    val artworkUri: String? = null,
    val elapsedMs: Long = 0L,
    val durationMs: Long = 0L,
    val playbackSpeed: Float = 1f,
    val queuePosition: Int = 0,
    val queueCount: Int = 0,
)

/** State of the (future) audio focus + session. */
enum class AudioSessionState { IDLE, ACTIVE, DUCKED, INTERRUPTED }

/**
 * The ExoPlayer surface the drill engine will consume. `STATE_*` values and
 * listener callbacks mirror `androidx.media3.common.Player`.
 */
interface AudioPlayer {
    enum class State { IDLE, BUFFERING, READY, ENDED }

    val state: State
    val isPlaying: Boolean
    val currentMediaItemIndex: Int
    val currentPositionMs: Long
    val bufferedPositionMs: Long

    fun setMediaItems(items: List<DrillAudioItem>)
    fun prepare()
    fun play()
    fun pause()
    fun seekTo(mediaItemIndex: Int, positionMs: Long)
    fun release()

    fun addListener(listener: Listener)
    fun removeListener(listener: Listener)

    interface Listener {
        fun onPlaybackStateChanged(state: State) {}
        fun onIsPlayingChanged(isPlaying: Boolean) {}
        fun onMediaItemTransition(mediaItem: DrillAudioItem?, reason: Int) {}
    }
}

/**
 * Audio focus + session lifecycle. Mirrors the parts of
 * `androidx.media3.session.MediaSession` and `AVAudioSession` behavior the app
 * will need (including the iOS-shaped duck/interruption semantics).
 */
interface AudioSessionService {
    val state: AudioSessionState
    val nowPlaying: NowPlayingInfo?

    fun configure()
    fun activate()
    fun deactivate()
    fun updateNowPlaying(info: NowPlayingInfo?)
    fun setDucked(ducked: Boolean)
    fun handleInterruptionBegan()
    fun handleInterruptionEnded(shouldResume: Boolean)
}

/** No-op audio session: keeps state so the UI can reflect it, but plays nothing. */
class StubAudioSessionService : AudioSessionService {

    override var state: AudioSessionState = AudioSessionState.IDLE
        private set

    override var nowPlaying: NowPlayingInfo? = null
        private set

    override fun configure() {
        state = AudioSessionState.IDLE
    }

    override fun activate() {
        state = AudioSessionState.ACTIVE
    }

    override fun deactivate() {
        state = AudioSessionState.IDLE
    }

    override fun updateNowPlaying(info: NowPlayingInfo?) {
        nowPlaying = info
    }

    override fun setDucked(ducked: Boolean) {
        state = if (ducked) AudioSessionState.DUCKED else AudioSessionState.ACTIVE
    }

    override fun handleInterruptionBegan() {
        state = AudioSessionState.INTERRUPTED
    }

    override fun handleInterruptionEnded(shouldResume: Boolean) {
        state = if (shouldResume) AudioSessionState.ACTIVE else AudioSessionState.IDLE
    }
}

/** No-op player used until ExoPlayer lands; it only records what would play. */
class StubAudioPlayer : AudioPlayer {

    private var items: List<DrillAudioItem> = emptyList()
    private val listeners = mutableListOf<AudioPlayer.Listener>()

    override var state: AudioPlayer.State = AudioPlayer.State.IDLE
        private set

    override var isPlaying: Boolean = false
        private set

    override var currentMediaItemIndex: Int = 0
        private set

    override var currentPositionMs: Long = 0L
        private set

    override var bufferedPositionMs: Long = 0L
        private set

    override fun setMediaItems(items: List<DrillAudioItem>) {
        this.items = items
        currentMediaItemIndex = 0
        currentPositionMs = 0L
    }

    override fun prepare() {
        state = if (items.isEmpty()) AudioPlayer.State.ENDED else AudioPlayer.State.READY
        listeners.forEach { it.onPlaybackStateChanged(state) }
    }

    override fun play() {
        if (state != AudioPlayer.State.READY) prepare()
        isPlaying = true
        listeners.forEach { it.onIsPlayingChanged(true) }
    }

    override fun pause() {
        isPlaying = false
        listeners.forEach { it.onIsPlayingChanged(false) }
    }

    override fun seekTo(mediaItemIndex: Int, positionMs: Long) {
        currentMediaItemIndex = mediaItemIndex.coerceIn(0, maxOf(0, items.lastIndex))
        currentPositionMs = maxOf(0L, positionMs)
    }

    override fun release() {
        items = emptyList()
        isPlaying = false
        state = AudioPlayer.State.IDLE
    }

    override fun addListener(listener: AudioPlayer.Listener) {
        listeners.add(listener)
    }

    override fun removeListener(listener: AudioPlayer.Listener) {
        listeners.remove(listener)
    }
}
