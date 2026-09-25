package app.ezber.android.audio

import app.ezber.android.services.AudioPlayer
import app.ezber.android.services.AudioSessionService
import app.ezber.android.services.AudioSessionState
import app.ezber.android.services.NowPlayingInfo

/**
 * The app-facing audio-session facade for the Media3 playback.
 *
 * Focus, ducking under navigation, becoming-noisy and the lock-screen
 * publication are handled inside [EzberMediaService]'s ExoPlayer/MediaSession,
 * so this object reflects the live player state for the UI instead of running
 * a second focus stack. The interface stays stable for the rest of the app.
 */
class MediaAudioSessionService(
    private val player: MediaControllerAudioPlayer,
) : AudioSessionService {

    override val state: AudioSessionState
        get() = when (player.state) {
            AudioPlayer.State.READY, AudioPlayer.State.BUFFERING -> AudioSessionState.ACTIVE
            else -> AudioSessionState.IDLE
        }

    override var nowPlaying: NowPlayingInfo? = null
        private set

    override fun configure() = Unit

    override fun activate() = Unit

    override fun deactivate() = Unit

    override fun updateNowPlaying(info: NowPlayingInfo?) {
        nowPlaying = info
    }

    override fun setDucked(ducked: Boolean) = Unit

    override fun handleInterruptionBegan() = Unit

    override fun handleInterruptionEnded(shouldResume: Boolean) = Unit
}
