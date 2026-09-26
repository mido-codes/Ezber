package app.ezber.android.audio

import app.ezber.android.models.DrillItem
import app.ezber.android.models.DrillQueue
import app.ezber.android.models.ResumePoint
import app.ezber.android.persistence.ContentProviding
import app.ezber.android.services.AudioPlayer
import app.ezber.android.services.DrillAudioItem
import app.ezber.android.services.DrillSessionConfiguration
import app.ezber.android.services.DrillSessionListener
import app.ezber.android.services.DrillSessionMetadata
import app.ezber.android.services.DrillSessionService
import app.ezber.android.services.DrillSessionState
import app.ezber.android.services.DrillSessionStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The real drill engine: walks the verse × repetition [DrillQueue] one item at
 * a time through a Media3 playback session.
 *
 * The plan is expanded by `DrillQueue.build` and each repeat becomes one media
 * item with a stable id (`preset + verse_key + repeat`), so the lock screen and
 * Android Auto navigate repeat by repeat and a resumed drill continues at the
 * exact repeat boundary. Audio is resolved from the content bundle's audio
 * manifest and downloaded into [AudioCache] before playback starts; there is no
 * placeholder path, so a missing manifest row surfaces as [DrillSessionStatus.ERROR].
 *
 * Auto-advance comes from ExoPlayer (repeat mode ALL when the preset loops),
 * manual transport moves the player directly, and the preset's pause between
 * repeats is a scheduled gap after each item transition. Completion is reported
 * at every boundary in the order the study player persists: the queue position
 * is advanced before [DrillSessionListener.onItemCompleted] fires, so the
 * resume point saved there names the next repeat.
 */
class MediaDrillSessionService(
    content: ContentProviding,
    cache: AudioCache,
    private val player: AudioPlayer,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) : DrillSessionService, AudioPlayer.Listener {

    override var listener: DrillSessionListener? = null

    override var state = DrillSessionState()
        private set

    override val queue: DrillQueue? get() = state.queue

    private val resolver = DrillAudioResolver(content, cache)

    private var configuration = DrillSessionConfiguration()
    private var metadata: DrillSessionMetadata? = null
    private var playWhenReady = false
    private var prepared = false
    private var itemCompletionRecorded = false
    private var inGap = false
    private var prepJob: Job? = null
    private var gapJob: Job? = null

    init {
        player.addListener(this)
    }

    // MARK: - DrillSessionService

    override fun load(
        queue: DrillQueue,
        startingAt: ResumePoint?,
        configuration: DrillSessionConfiguration,
        metadata: DrillSessionMetadata?,
    ) {
        cancelJobs()
        this.configuration = configuration
        this.metadata = metadata
        this.playWhenReady = false
        // Stop any previous drill that is still audible while the new plan
        // resolves; its media items are replaced on the next play().
        if (prepared) player.pause()
        this.prepared = false
        this.itemCompletionRecorded = false
        player.setLooping(false)

        var next = DrillSessionState(
            queue = queue,
            totalItemCount = queue.count,
            configuration = configuration,
        )
        if (startingAt != null) {
            queue.indexForResume(startingAt)?.let { index ->
                next = next.copy(currentIndex = index, completedItemCount = index)
            }
        }
        state = next.copy(status = if (queue.isEmpty) DrillSessionStatus.COMPLETED else DrillSessionStatus.PAUSED)
        notifyState()
    }

    override fun play() {
        val loaded = state.queue ?: return
        if (loaded.isEmpty) return
        if (state.status == DrillSessionStatus.COMPLETED) {
            restart()
        }
        playWhenReady = true
        if (!prepared || state.status == DrillSessionStatus.ERROR) {
            state = state.copy(status = DrillSessionStatus.LOADING, errorMessage = null)
            notifyState()
            preparePlayback()
        } else {
            state = state.copy(status = DrillSessionStatus.PLAYING)
            player.play()
            notifyState()
        }
    }

    override fun pause() {
        playWhenReady = false
        cancelGap()
        if (state.status == DrillSessionStatus.PLAYING || state.status == DrillSessionStatus.LOADING) {
            if (prepared) player.pause()
            state = state.copy(
                status = if (state.queue?.isEmpty == true) {
                    DrillSessionStatus.COMPLETED
                } else {
                    DrillSessionStatus.PAUSED
                },
            )
            notifyState()
        }
    }

    override fun togglePlayPause() {
        if (state.status == DrillSessionStatus.PLAYING) pause() else play()
    }

    override fun nextRepeat() {
        if (state.status == DrillSessionStatus.COMPLETED || state.status == DrillSessionStatus.ERROR) return
        val loaded = state.queue ?: return
        if (loaded.isEmpty) return
        val finished = loaded.items.getOrNull(state.currentIndex)
        val finishedIndex = state.currentIndex
        when {
            finishedIndex + 1 < loaded.items.size -> {
                // Advance the queue before the completion callback so a resume
                // point saved from it names the next repeat.
                state = state.copy(
                    currentIndex = finishedIndex + 1,
                    completedItemCount = maxOf(state.completedItemCount, finishedIndex + 1),
                )
                itemCompletionRecorded = false
                if (finished != null) listener?.onItemCompleted(finished, finishedIndex)
                if (prepared) player.seekTo(finishedIndex + 1, 0)
                notifyState()
                scheduleGapThenPlay()
            }

            configuration.loopUntilStopped -> {
                state = state.copy(currentIndex = 0, completedItemCount = 0)
                itemCompletionRecorded = false
                if (finished != null) listener?.onItemCompleted(finished, finishedIndex)
                if (prepared) player.seekTo(0, 0)
                notifyState()
                scheduleGapThenPlay()
            }

            else -> finishQueue()
        }
    }

    override fun previousRepeat() {
        val loaded = state.queue ?: return
        if (loaded.isEmpty || state.status == DrillSessionStatus.COMPLETED) return
        if (state.currentIndex > 0) {
            state = state.copy(
                currentIndex = state.currentIndex - 1,
                completedItemCount = minOf(state.completedItemCount, state.currentIndex - 1),
            )
            itemCompletionRecorded = false
            if (prepared) player.seekTo(state.currentIndex, 0)
            notifyState()
            scheduleGapThenPlay()
        }
    }

    override fun nextVerse() {
        val loaded = state.queue ?: return
        val current = state.currentItem ?: return
        val index = loaded.firstIndexOfVerseAfter(current.verse.number)
            ?: (loaded.count - 1).takeIf { loaded.count > 0 }
        if (index != null) jumpTo(index)
    }

    override fun previousVerse() {
        val loaded = state.queue ?: return
        val current = state.currentItem ?: return
        val index = loaded.firstIndexOfVerseBefore(current.verse.number)
        if (index != null) {
            val previousVerseNumber = loaded.items[index].verse.number
            jumpTo(loaded.firstIndexOfVerse(previousVerseNumber) ?: index)
        } else {
            jumpTo(0)
        }
    }

    override fun seekTo(item: DrillItem) {
        val loaded = state.queue ?: return
        val index = loaded.items.indexOfFirst { it.id == item.id }
        if (index >= 0) jumpTo(index)
    }

    override fun restart() {
        cancelJobs()
        playWhenReady = false
        itemCompletionRecorded = false
        state = state.copy(
            currentIndex = 0,
            completedItemCount = 0,
            status = if (state.queue?.isEmpty == true) {
                DrillSessionStatus.COMPLETED
            } else {
                DrillSessionStatus.PAUSED
            },
            errorMessage = null,
        )
        if (prepared) {
            player.pause()
            player.seekTo(0, 0)
        }
        notifyState()
    }

    override fun stop() {
        cancelJobs()
        playWhenReady = false
        itemCompletionRecorded = false
        if (prepared) player.pause()
        state = state.copy(status = DrillSessionStatus.IDLE)
        notifyState()
    }

    // MARK: - AudioPlayer.Listener

    override fun onPlaybackStateChanged(state: AudioPlayer.State) {
        if (state != AudioPlayer.State.ENDED || !prepared) return
        if (configuration.loopUntilStopped) return
        finishQueue()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        if (!prepared || inGap) return
        if (state.status == DrillSessionStatus.ERROR || state.status == DrillSessionStatus.COMPLETED) return
        val status = when {
            isPlaying -> DrillSessionStatus.PLAYING
            state.status == DrillSessionStatus.PLAYING || state.status == DrillSessionStatus.LOADING ->
                DrillSessionStatus.PAUSED
            else -> return
        }
        if (state.status != status) {
            state = state.copy(status = status)
            notifyState()
        }
    }

    override fun onMediaItemTransition(mediaItem: DrillAudioItem?, reason: Int) {
        if (!prepared) return
        when (reason) {
            AudioPlayer.REASON_AUTO -> handleAutoAdvance()
            AudioPlayer.REASON_REPEAT -> handleLoopWrap()
            AudioPlayer.REASON_SEEK -> handleSeek()
            // Playlist changes come from our own preparation; the plan state is
            // owned here, so there is nothing to mirror.
            else -> Unit
        }
    }

    // MARK: - Preparation

    private fun preparePlayback() {
        if (prepJob?.isActive == true) return
        prepJob = scope.launch {
            val loaded = state.queue ?: return@launch
            val sessionMetadata = metadata
            try {
                val reciterId = sessionMetadata?.reciterId
                    ?: throw IllegalStateException("Choose a reciter before playing this preset")
                val distinctVerses = loaded.items.map { it.verse }.distinctBy { it.reference }
                state = state.copy(audioReadyCount = 0, audioTotalCount = distinctVerses.size)
                notifyState()
                val resolved = LinkedHashMap<String, ResolvedVerseAudio>()
                for (verse in distinctVerses) {
                    resolved[verse.reference] =
                        resolver.resolve(reciterId, verse.surahId, verse.number)
                    state = state.copy(audioReadyCount = resolved.size)
                    notifyState()
                }
                if (!isActive) return@launch

                val items = loaded.items.map { item ->
                    buildAudioItem(
                        item = item,
                        resolved = resolved.getValue(item.verse.reference),
                        presetId = loaded.presetId,
                        sessionMetadata = sessionMetadata,
                    )
                }
                player.setMediaItems(items)
                player.setLooping(configuration.loopUntilStopped)
                player.prepare()
                if (state.currentIndex != 0) player.seekTo(state.currentIndex, 0)
                prepared = true
                itemCompletionRecorded = false
                state = state.copy(status = if (playWhenReady) DrillSessionStatus.PLAYING else DrillSessionStatus.PAUSED)
                notifyState()
                if (playWhenReady) player.play()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                fail(error)
            }
        }
    }

    private fun buildAudioItem(
        item: DrillItem,
        resolved: ResolvedVerseAudio,
        presetId: Long,
        sessionMetadata: DrillSessionMetadata?,
    ): DrillAudioItem {
        val verseKey = item.verse.reference
        return DrillAudioItem(
            id = item.id,
            uri = resolved.uri.toString(),
            mediaId = DrillMedia.drillMediaId(presetId, item),
            verseKey = verseKey,
            repeatIndex = item.repeatIndex,
            mimeType = resolved.mimeType,
            title = sessionMetadata?.let { "${it.surahName} $verseKey" } ?: verseKey,
            subtitle = "Repeat ${item.repeatIndex} of ${item.repeatCount}",
            albumTitle = sessionMetadata?.presetName,
            artist = sessionMetadata?.reciterName,
            extras = mapOf(
                DrillMedia.EXTRA_PRESET_ID to presetId.toString(),
                DrillMedia.EXTRA_VERSE_KEY to verseKey,
                DrillMedia.EXTRA_VERSE_NUMBER to item.verse.number.toString(),
                DrillMedia.EXTRA_REPEAT_INDEX to item.repeatIndex.toString(),
                DrillMedia.EXTRA_REPEAT_COUNT to item.repeatCount.toString(),
            ),
        )
    }

    private fun fail(error: Exception) {
        prepared = false
        playWhenReady = false
        state = state.copy(
            status = DrillSessionStatus.ERROR,
            errorMessage = error.message ?: "Playback could not start",
        )
        notifyState()
    }

    // MARK: - Queue movement

    private fun handleAutoAdvance() {
        val loaded = state.queue ?: return
        val newIndex = player.currentMediaItemIndex
        if (newIndex !in loaded.items.indices) return
        val finished = loaded.items.getOrNull(state.currentIndex)
        val finishedIndex = state.currentIndex
        state = state.copy(
            currentIndex = newIndex,
            completedItemCount = maxOf(state.completedItemCount, newIndex),
        )
        itemCompletionRecorded = false
        if (finished != null && finishedIndex != newIndex) {
            listener?.onItemCompleted(finished, finishedIndex)
        }
        notifyState()
        scheduleGapThenPlay()
    }

    private fun handleLoopWrap() {
        val loaded = state.queue ?: return
        val finished = loaded.items.getOrNull(state.currentIndex)
        val finishedIndex = state.currentIndex
        state = state.copy(
            currentIndex = 0,
            completedItemCount = 0,
        )
        itemCompletionRecorded = false
        if (finished != null) {
            listener?.onItemCompleted(finished, finishedIndex)
        }
        notifyState()
        scheduleGapThenPlay()
    }

    private fun handleSeek() {
        val loaded = state.queue ?: return
        val newIndex = player.currentMediaItemIndex
        if (newIndex !in loaded.items.indices) return
        if (newIndex == state.currentIndex) {
            itemCompletionRecorded = false
            return
        }
        state = state.copy(
            currentIndex = newIndex,
            completedItemCount = maxOf(state.completedItemCount, newIndex),
        )
        itemCompletionRecorded = false
        notifyState()
    }

    private fun jumpTo(index: Int) {
        val loaded = state.queue ?: return
        if (index !in loaded.items.indices) return
        state = state.copy(
            currentIndex = index,
            completedItemCount = maxOf(state.completedItemCount, index),
        )
        itemCompletionRecorded = false
        if (prepared) player.seekTo(index, 0)
        notifyState()
        scheduleGapThenPlay()
    }

    private fun finishQueue() {
        cancelGap()
        playWhenReady = false
        if (prepared) player.pause()
        val lastIndex = state.currentIndex
        val lastItem = state.queue?.items?.getOrNull(lastIndex)
        if (lastItem != null && !itemCompletionRecorded) {
            itemCompletionRecorded = true
            state = state.copy(completedItemCount = maxOf(state.completedItemCount, lastIndex + 1))
            state = state.copy(status = DrillSessionStatus.COMPLETED)
            listener?.onItemCompleted(lastItem, lastIndex)
        } else {
            state = state.copy(status = DrillSessionStatus.COMPLETED)
        }
        notifyState()
        listener?.onFinished()
    }

    // MARK: - Repeats gap

    private fun scheduleGapThenPlay() {
        cancelGap()
        if (state.status != DrillSessionStatus.PLAYING || !prepared || !playWhenReady) return
        val pauseMs = configuration.pauseBetweenRepeatsMs
        if (pauseMs <= 0) {
            player.play()
            return
        }
        inGap = true
        player.pause()
        gapJob = scope.launch {
            delay(pauseMs.toLong())
            inGap = false
            if (state.status == DrillSessionStatus.PLAYING && prepared && playWhenReady) {
                player.play()
            }
        }
    }

    private fun cancelGap() {
        gapJob?.cancel()
        gapJob = null
        inGap = false
    }

    private fun cancelJobs() {
        cancelGap()
        prepJob?.cancel()
        prepJob = null
    }

    private fun notifyState() {
        listener?.onStateChanged(state)
    }
}
