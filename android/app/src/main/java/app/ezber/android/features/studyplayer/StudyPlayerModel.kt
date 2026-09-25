package app.ezber.android.features.studyplayer

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.ezber.android.AppEnvironment
import app.ezber.android.models.DrillItem
import app.ezber.android.models.DrillQueue
import app.ezber.android.models.Iso8601
import app.ezber.android.models.Note
import app.ezber.android.models.PlanState
import app.ezber.android.models.Preset
import app.ezber.android.models.ResumePoint
import app.ezber.android.models.StudySession
import app.ezber.android.models.Surah
import app.ezber.android.models.Translation
import app.ezber.android.models.TranslationMode
import app.ezber.android.models.Verse
import app.ezber.android.services.DrillSessionConfiguration
import app.ezber.android.services.DrillSessionListener
import app.ezber.android.services.DrillSessionMetadata
import app.ezber.android.services.DrillSessionState
import app.ezber.android.services.DrillSessionStatus

/**
 * Drives the study player: owns the queue, talks to the drill session service,
 * and persists progress and the resume point at every repeat boundary.
 */
class StudyPlayerModel(
    val preset: Preset,
    val surah: Surah,
    val queue: DrillQueue,
    private val app: AppEnvironment,
) : DrillSessionListener {

    var state by mutableStateOf(DrillSessionState())
        private set

    var isTranslationRevealed by mutableStateOf(false)
    var noteDraft by mutableStateOf("")

    private val sessionStartedAt: String = Iso8601.now()
    private var sessionId: Long = 0L

    init {
        val plan = app.userData.planState(preset.id)
        val resume = plan?.let { stored ->
            queue.items.getOrNull(stored.planIndex)?.let {
                ResumePoint(it.verse.number, it.repeatIndex)
            }
        }
        val reciter = preset.reciterId?.let { app.content.reciter(it) }
        app.drillSession.load(
            queue = queue,
            startingAt = resume,
            configuration = DrillSessionConfiguration(
                loopUntilStopped = preset.display.loopUntilStopped,
                pauseBetweenRepeatsMs = preset.display.pauseBetweenRepeatsMs,
            ),
            metadata = DrillSessionMetadata(
                presetName = preset.name,
                surahName = surah.nameLatin,
                reciterId = preset.reciterId,
                reciterName = reciter?.name,
            ),
        )
        state = app.drillSession.state
        app.drillSession.listener = this

        app.userData.markPresetUsed(preset.id)
        sessionId = app.userData.saveSession(
            StudySession(presetId = preset.id, startedAt = sessionStartedAt),
        )
        app.notifyDataChanged()
    }

    // MARK: - Derived state

    val currentVerse: Verse? get() = state.currentItem?.verse

    val currentTranslation: Translation? get() = currentVerse?.translations?.firstOrNull()

    val positionInSection: Int
        get() = currentVerse?.let { maxOf(1, it.number - preset.range.start + 1) } ?: 1

    val sectionCount: Int get() = maxOf(1, preset.range.count)

    val reciterName: String
        get() = preset.reciterId?.let { id -> app.content.reciter(id)?.name } ?: "No reciter"

    val isPlaying: Boolean get() = state.status == DrillSessionStatus.PLAYING

    val isLoading: Boolean get() = state.status == DrillSessionStatus.LOADING

    val errorMessage: String? get() = state.errorMessage

    val hasReciter: Boolean get() = preset.reciterId != null

    val isCompleted: Boolean get() = state.status == DrillSessionStatus.COMPLETED

    val shouldShowTranslation: Boolean
        get() = when (preset.display.translationMode) {
            TranslationMode.ALWAYS_SHOWN -> true
            TranslationMode.TAP_TO_REVEAL -> isTranslationRevealed
            TranslationMode.HIDDEN_DURING_PLAYBACK -> !isPlaying
        }

    // MARK: - Transport

    fun togglePlayPause() {
        when (state.status) {
            DrillSessionStatus.PLAYING, DrillSessionStatus.LOADING -> app.drillSession.pause()
            DrillSessionStatus.COMPLETED -> {
                app.drillSession.restart()
                app.drillSession.play()
            }

            DrillSessionStatus.IDLE, DrillSessionStatus.PAUSED, DrillSessionStatus.ERROR ->
                app.drillSession.play()
        }
    }

    fun nextRepeat() = app.drillSession.nextRepeat()
    fun previousRepeat() = app.drillSession.previousRepeat()
    fun nextVerse() = app.drillSession.nextVerse()
    fun previousVerse() = app.drillSession.previousVerse()
    fun toggleTranslation() {
        isTranslationRevealed = !isTranslationRevealed
    }

    fun teardown() {
        app.drillSession.pause()
        app.drillSession.listener = null
        finishSession(interrupted = !isCompleted)
        app.notifyDataChanged()
    }

    // MARK: - Notes

    fun saveNote() {
        val body = noteDraft.trim()
        val verse = currentVerse ?: return
        if (body.isEmpty()) return
        app.userData.saveNote(
            Note(
                verseKey = verse.reference,
                bodyMarkdown = body,
                createdAt = Iso8601.now(),
                updatedAt = Iso8601.now(),
            ),
        )
        app.notifyDataChanged()
        noteDraft = ""
    }

    // MARK: - DrillSessionListener

    override fun onStateChanged(state: DrillSessionState) {
        this.state = state
        saveResumePoint()
    }

    override fun onItemCompleted(item: DrillItem, index: Int) {
        app.userData.recordCompletion(item, preset.id)
        saveResumePoint()
        app.notifyDataChanged()
    }

    override fun onFinished() {
        finishSession(interrupted = false)
    }

    // MARK: - Persistence

    private fun saveResumePoint() {
        if (state.queue == null) return
        app.userData.savePlanState(
            PlanState(
                presetId = preset.id,
                planIndex = state.currentIndex,
                positionMs = 0L,
                repetitionCountersJson = null,
                updatedAt = Iso8601.now(),
            ),
        )
    }

    private fun finishSession(interrupted: Boolean) {
        if (sessionId == 0L) return
        app.userData.saveSession(
            StudySession(
                id = sessionId,
                presetId = preset.id,
                startedAt = sessionStartedAt,
                endedAt = Iso8601.now(),
                versesCovered = state.queue?.verseNumbers?.size ?: 0,
                repetitions = state.completedItemCount,
                interrupted = interrupted,
            ),
        )
    }
}
