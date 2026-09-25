package app.ezber.android.services

import android.os.Handler
import android.os.Looper
import app.ezber.android.models.DrillItem
import app.ezber.android.models.DrillQueue
import app.ezber.android.models.ResumePoint

/** Playback-related configuration a drill runs with. */
data class DrillSessionConfiguration(
    val loopUntilStopped: Boolean = false,
    val pauseBetweenRepeatsMs: Int = 500,
)

enum class DrillSessionStatus { IDLE, LOADING, PLAYING, PAUSED, COMPLETED, ERROR }

/**
 * What the lock screen and Android Auto should show while a drill runs: the
 * preset whose plan is loaded, the surah verse labels and the reciter whose
 * audio is resolved from the content manifest.
 */
data class DrillSessionMetadata(
    val presetName: String,
    val surahName: String,
    val reciterId: Int?,
    val reciterName: String? = null,
)

/**
 * Everything the study player needs to render: the queue, the current item,
 * the repeat counter and the overall position.
 */
data class DrillSessionState(
    val queue: DrillQueue? = null,
    val status: DrillSessionStatus = DrillSessionStatus.IDLE,
    val currentIndex: Int = 0,
    val completedItemCount: Int = 0,
    val totalItemCount: Int = 0,
    val configuration: DrillSessionConfiguration = DrillSessionConfiguration(),
    val errorMessage: String? = null,
    val audioReadyCount: Int = 0,
    val audioTotalCount: Int = 0,
) {
    val currentItem: DrillItem? get() = queue?.items?.getOrNull(currentIndex)
    val currentRepeat: Int get() = currentItem?.repeatIndex ?: 0
    val repeatCount: Int get() = currentItem?.repeatCount ?: 0
    val currentVerseNumber: Int? get() = currentItem?.verse?.number

    val resumePoint: ResumePoint?
        get() = currentItem?.let { ResumePoint(it.verse.number, it.repeatIndex) }

    val progress: Float
        get() = if (totalItemCount > 0) {
            (completedItemCount.toFloat() / totalItemCount).coerceIn(0f, 1f)
        } else {
            0f
        }
}

/** The study player listens through this; the model records progress and resume points. */
interface DrillSessionListener {
    fun onStateChanged(state: DrillSessionState)
    fun onItemCompleted(item: DrillItem, index: Int)
    fun onFinished()
}

/**
 * The drill engine interface. A drill is expressed as a [DrillQueue] — the
 * verse × repetition plan — so any implementation (stub now, ExoPlayer later)
 * drives the same UI and the same resume semantics.
 */
interface DrillSessionService {
    var listener: DrillSessionListener?
    val state: DrillSessionState
    val queue: DrillQueue?

    fun load(
        queue: DrillQueue,
        startingAt: ResumePoint?,
        configuration: DrillSessionConfiguration,
        metadata: DrillSessionMetadata? = null,
    )
    fun play()
    fun pause()
    fun togglePlayPause()
    fun nextRepeat()
    fun previousRepeat()
    fun nextVerse()
    fun previousVerse()
    fun seekTo(item: DrillItem)
    fun restart()
    fun stop()
}

/**
 * Simulated playback: advances through the queue on a main-looper timer so the
 * whole flow is clickable without audio. Manual transport controls work exactly
 * as the real engine will make them work.
 */
class StubDrillSessionService(
    private val handler: Handler = Handler(Looper.getMainLooper()),
) : DrillSessionService {

    override var listener: DrillSessionListener? = null

    override var state = DrillSessionState()
        private set

    override val queue: DrillQueue? get() = state.queue

    /** How long one simulated repetition lasts. */
    var simulatedRepeatDurationMs: Long = 4_000

    private var elapsedInRepeatMs: Long = 0
    private var ticking = false

    private val tick = object : Runnable {
        override fun run() {
            if (state.status != DrillSessionStatus.PLAYING) {
                ticking = false
                return
            }
            elapsedInRepeatMs += TICK_INTERVAL_MS
            if (elapsedInRepeatMs >= simulatedRepeatDurationMs) {
                advance(completingCurrent = true)
            }
            if (state.status == DrillSessionStatus.PLAYING) {
                handler.postDelayed(this, TICK_INTERVAL_MS)
            } else {
                ticking = false
            }
        }
    }

    override fun load(
        queue: DrillQueue,
        startingAt: ResumePoint?,
        configuration: DrillSessionConfiguration,
        metadata: DrillSessionMetadata?,
    ) {
        var newState = DrillSessionState()
        newState = newState.copy(
            queue = queue,
            totalItemCount = queue.count,
            configuration = configuration,
        )
        if (startingAt != null) {
            val index = queue.indexForResume(startingAt)
            if (index != null) {
                newState = newState.copy(currentIndex = index, completedItemCount = index)
            }
        }
        state = newState.copy(
            status = if (queue.isEmpty) DrillSessionStatus.COMPLETED else DrillSessionStatus.PAUSED,
        )
        elapsedInRepeatMs = 0
        stopTicking()
        notifyState()
    }

    override fun play() {
        if (state.queue?.isEmpty != false) return
        if (state.status == DrillSessionStatus.COMPLETED) {
            restart()
        }
        state = state.copy(status = DrillSessionStatus.PLAYING)
        startTicking()
        notifyState()
    }

    override fun pause() {
        if (state.status != DrillSessionStatus.PLAYING) return
        state = state.copy(status = DrillSessionStatus.PAUSED)
        stopTicking()
        notifyState()
    }

    override fun togglePlayPause() {
        if (state.status == DrillSessionStatus.PLAYING) pause() else play()
    }

    override fun nextRepeat() {
        if (state.status == DrillSessionStatus.COMPLETED) return
        advance(completingCurrent = true)
    }

    override fun previousRepeat() {
        val queue = state.queue ?: return
        if (queue.isEmpty || state.status == DrillSessionStatus.COMPLETED) return
        if (state.currentIndex > 0) {
            state = state.copy(
                currentIndex = state.currentIndex - 1,
                completedItemCount = minOf(state.completedItemCount, state.currentIndex - 1),
            )
        }
        elapsedInRepeatMs = 0
        if (state.status == DrillSessionStatus.PLAYING) startTicking() else stopTicking()
        notifyState()
    }

    override fun nextVerse() {
        val queue = state.queue ?: return
        val current = state.currentItem ?: return
        val index = queue.firstIndexOfVerseAfter(current.verse.number)
            ?: (queue.count - 1).takeIf { queue.count > 0 }
        if (index != null) jumpTo(index)
    }

    override fun previousVerse() {
        val queue = state.queue ?: return
        val current = state.currentItem ?: return
        val index = queue.firstIndexOfVerseBefore(current.verse.number)
        if (index != null) {
            val previousVerseNumber = queue.items[index].verse.number
            jumpTo(queue.firstIndexOfVerse(previousVerseNumber) ?: index)
        } else {
            jumpTo(0)
        }
    }

    override fun seekTo(item: DrillItem) {
        val queue = state.queue ?: return
        val index = queue.items.indexOfFirst { it.id == item.id }
        if (index >= 0) jumpTo(index)
    }

    override fun restart() {
        state = state.copy(
            currentIndex = 0,
            completedItemCount = 0,
            status = if (state.queue?.isEmpty == true) {
                DrillSessionStatus.COMPLETED
            } else {
                DrillSessionStatus.PAUSED
            },
        )
        elapsedInRepeatMs = 0
        stopTicking()
        notifyState()
    }

    override fun stop() {
        stopTicking()
        state = state.copy(status = DrillSessionStatus.IDLE)
        elapsedInRepeatMs = 0
        notifyState()
    }

    // MARK: - Private

    private fun advance(completingCurrent: Boolean) {
        val queue = state.queue ?: return
        val item = state.currentItem ?: return
        val index = state.currentIndex
        if (completingCurrent) {
            state = state.copy(completedItemCount = maxOf(state.completedItemCount, index + 1))
        }

        // Advance the queue before notifying so a resume point saved from the
        // completion callback points at the next repeat, not the finished one.
        when {
            index + 1 < queue.items.size -> {
                state = state.copy(currentIndex = index + 1)
                elapsedInRepeatMs = 0
                if (completingCurrent) listener?.onItemCompleted(item, index)
                notifyState()
            }

            state.configuration.loopUntilStopped -> {
                state = state.copy(currentIndex = 0, completedItemCount = 0)
                elapsedInRepeatMs = 0
                if (completingCurrent) listener?.onItemCompleted(item, index)
                notifyState()
            }

            else -> {
                stopTicking()
                state = state.copy(status = DrillSessionStatus.COMPLETED)
                if (completingCurrent) listener?.onItemCompleted(item, index)
                notifyState()
                listener?.onFinished()
            }
        }
    }

    private fun jumpTo(index: Int) {
        val queue = state.queue ?: return
        if (index !in queue.items.indices) return
        state = state.copy(
            currentIndex = index,
            completedItemCount = maxOf(state.completedItemCount, index),
        )
        elapsedInRepeatMs = 0
        if (state.status == DrillSessionStatus.PLAYING) startTicking() else stopTicking()
        notifyState()
    }

    private fun startTicking() {
        stopTicking()
        ticking = true
        handler.postDelayed(tick, TICK_INTERVAL_MS)
    }

    private fun stopTicking() {
        ticking = false
        handler.removeCallbacks(tick)
    }

    private fun notifyState() {
        listener?.onStateChanged(state)
    }

    companion object {
        private const val TICK_INTERVAL_MS = 250L
    }
}
