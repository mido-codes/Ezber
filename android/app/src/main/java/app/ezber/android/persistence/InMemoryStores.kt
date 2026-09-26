package app.ezber.android.persistence

import app.ezber.android.models.DownloadState
import app.ezber.android.models.DrillItem
import app.ezber.android.models.Iso8601
import app.ezber.android.models.MemorizationState
import app.ezber.android.models.Note
import app.ezber.android.models.PlanState
import app.ezber.android.models.Preset
import app.ezber.android.models.Reciter
import app.ezber.android.models.StudySession
import app.ezber.android.models.Surah
import app.ezber.android.models.Verse
import app.ezber.android.models.VerseId
import app.ezber.android.models.VerseProgress
import app.ezber.android.models.VerseRange
import app.ezber.android.models.VerseWord
import app.ezber.android.models.WordSegment

/**
 * Empty in-memory content store used by Compose previews. The live app always
 * reads from [SqliteContentStore]; this exists so a preview can render the
 * loading/empty states without touching a database or the network.
 */
class InMemoryContentStore(
    private val surahs: List<Surah> = emptyList(),
    private val reciters: List<Reciter> = emptyList(),
    private val verses: List<Verse> = emptyList(),
    private val words: Map<Int, List<VerseWord>> = emptyMap(),
    private val segments: Map<Pair<Int, Int>, List<WordSegment>> = emptyMap(),
) : ContentProviding {

    override fun allSurahs(): List<Surah> = surahs

    override fun surah(id: Int): Surah? = surahs.firstOrNull { it.id == id }

    override fun verses(surahId: Int, inRange: VerseRange): List<Verse> =
        verses.filter { it.surahId == surahId && inRange.contains(it.number) }

    override fun allReciters(): List<Reciter> = reciters

    override fun reciter(id: Int?): Reciter? = reciters.firstOrNull { it.id == id }

    override fun downloadState(reciterId: Int, surahId: Int): DownloadState = DownloadState.NOT_DOWNLOADED

    override fun words(ayahIds: List<Int>): Map<Int, List<VerseWord>> =
        words.filterKeys { it in ayahIds }

    override fun segments(reciterId: Int, ayahIds: List<Int>): Map<Int, List<WordSegment>> =
        buildMap {
            for (ayahId in ayahIds) {
                segments[reciterId to ayahId]?.let { put(ayahId, it) }
            }
        }
}

/**
 * In-memory user data store used by previews and as a last-resort fallback when
 * the SQLite user database cannot be opened. Behavior matches [SqliteUserDataStore].
 */
class InMemoryUserDataStore : UserDataStore {

    private var nextPresetId = 1L
    private var nextNoteId = 1L
    private var nextSessionId = 1L

    private val presets = linkedMapOf<Long, Preset>()
    private val progressByKey = linkedMapOf<Pair<Long, Int>, VerseProgress>()
    private val planStates = linkedMapOf<Long, PlanState>()
    private val sessions = linkedMapOf<Long, StudySession>()
    private val notes = linkedMapOf<Long, Note>()
    private val settings = linkedMapOf<String, String>()

    // MARK: - Presets

    override fun allPresets(): List<Preset> =
        presets.values.sortedByDescending { it.updatedAt ?: it.createdAt ?: "" }

    override fun preset(id: Long): Preset? = presets[id]

    override fun savePreset(preset: Preset): Long {
        val id = if (preset.id == 0L) nextPresetId++ else preset.id
        presets[id] = preset.copy(id = id)
        return id
    }

    override fun deletePreset(id: Long) {
        presets.remove(id)
        progressByKey.keys.removeAll { it.first == id }
        planStates.remove(id)
        if (lastPresetId() == id) setLastPresetId(null)
    }

    override fun lastUsedPreset(): Preset? =
        lastPresetId()?.let(::preset) ?: allPresets().firstOrNull()

    override fun markPresetUsed(id: Long, at: String) {
        val preset = presets[id] ?: return
        presets[id] = preset.copy(lastUsedAt = at, updatedAt = at)
        setLastPresetId(id)
    }

    override fun lastPresetId(): Long? = settings[LAST_PRESET_KEY]?.toLongOrNull()

    override fun setLastPresetId(id: Long?) {
        setSettingValue(LAST_PRESET_KEY, id?.toString())
    }

    // MARK: - Progress

    override fun allProgress(): List<VerseProgress> =
        progressByKey.values.sortedWith(compareBy({ it.verseId }, { it.presetId }))

    override fun progressForPreset(presetId: Long): List<VerseProgress> =
        allProgress().filter { it.presetId == presetId }

    override fun progressForVerse(verseId: VerseId): List<VerseProgress> =
        allProgress().filter { it.verseId == verseId }

    override fun saveProgress(progress: VerseProgress) {
        progressByKey[progress.presetId to progress.verseId.number] = progress
    }

    override fun recordCompletion(item: DrillItem, presetId: Long, at: String) {
        val key = presetId to item.verse.number
        val existing = progressByKey[key]
        val repetitions = (existing?.repetitionsDone ?: 0) + 1
        progressByKey[key] = VerseProgress(
            presetId = presetId,
            verseId = item.verse.id,
            repetitionsDone = repetitions,
            state = MemorizationState.derived(repetitions),
            lastPlayedAt = at,
            nextReviewAt = existing?.nextReviewAt,
        )
    }

    // MARK: - Resume state

    override fun planState(presetId: Long): PlanState? = planStates[presetId]

    override fun savePlanState(planState: PlanState) {
        planStates[planState.presetId] = planState.copy(updatedAt = planState.updatedAt ?: Iso8601.now())
    }

    override fun deletePlanState(presetId: Long) {
        planStates.remove(presetId)
    }

    // MARK: - Session history

    override fun recentSessions(limit: Int): List<StudySession> =
        sessions.values.sortedByDescending { it.startedAt }.take(maxOf(1, limit))

    override fun saveSession(session: StudySession): Long {
        val id = if (session.id == 0L) nextSessionId++ else session.id
        sessions[id] = session.copy(id = id)
        return id
    }

    // MARK: - Notes

    override fun allNotes(): List<Note> =
        notes.values.sortedByDescending { it.updatedAt ?: it.createdAt ?: "" }

    override fun notesForVerse(verseKey: String): List<Note> =
        allNotes().filter { it.verseKey == verseKey }

    override fun searchNotes(query: String): List<Note> {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return allNotes()
        return allNotes().filter { it.bodyMarkdown.contains(trimmed, ignoreCase = true) }
    }

    override fun saveNote(note: Note): Long {
        val id = if (note.id == 0L) nextNoteId++ else note.id
        val now = Iso8601.now()
        notes[id] = note.copy(
            id = id,
            createdAt = note.createdAt ?: now,
            updatedAt = note.updatedAt ?: now,
        )
        return id
    }

    override fun deleteNote(id: Long) {
        notes.remove(id)
    }

    // MARK: - Settings

    override fun settingValue(key: String): String? = settings[key]

    override fun setSettingValue(key: String, value: String?) {
        if (value == null) settings.remove(key) else settings[key] = value
    }

    override fun deleteSettingsWithPrefix(prefix: String) {
        settings.keys.removeAll { it.startsWith(prefix) }
    }

    companion object {
        private const val LAST_PRESET_KEY = "last_preset_id"
    }
}
