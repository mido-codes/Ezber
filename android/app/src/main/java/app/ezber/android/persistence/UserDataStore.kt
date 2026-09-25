package app.ezber.android.persistence

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import app.ezber.android.models.DisplayOptions
import app.ezber.android.models.DownloadScope
import app.ezber.android.models.DrillItem
import app.ezber.android.models.Iso8601
import app.ezber.android.models.MemorizationState
import app.ezber.android.models.Note
import app.ezber.android.models.PlanState
import app.ezber.android.models.PlaybackMode
import app.ezber.android.models.Preset
import app.ezber.android.models.RepeatPlan
import app.ezber.android.models.StudySession
import app.ezber.android.models.TranslationMode
import app.ezber.android.models.TransliterationStyle
import app.ezber.android.models.VerseId
import app.ezber.android.models.VerseProgress
import app.ezber.android.models.VerseRange
import org.json.JSONObject

/**
 * Device-local user data: presets, per-verse progress, resume state, session
 * history, notes and small app state. Implemented by [SqliteUserDataStore] in
 * the app and by `InMemoryUserDataStore` for previews / as a fallback.
 *
 * The table shapes are the shared ones in schema/user_schema.sql. Three
 * per-preset display options have no column there (translation mode,
 * transliteration style, loop-until-stopped); the store keeps them in the
 * `settings` key/value table under `presets.<id>.display_extras`.
 */
interface UserDataStore {

    // Presets
    fun allPresets(): List<Preset>
    fun preset(id: Long): Preset?
    fun savePreset(preset: Preset): Long
    fun deletePreset(id: Long)
    fun lastUsedPreset(): Preset?
    fun markPresetUsed(id: Long, at: String = Iso8601.now())
    fun lastPresetId(): Long?
    fun setLastPresetId(id: Long?)

    // Progress
    fun allProgress(): List<VerseProgress>
    fun progressForPreset(presetId: Long): List<VerseProgress>
    fun progressForVerse(verseId: VerseId): List<VerseProgress>
    fun saveProgress(progress: VerseProgress)
    fun recordCompletion(item: DrillItem, presetId: Long, at: String = Iso8601.now())

    // Resume state
    fun planState(presetId: Long): PlanState?
    fun savePlanState(planState: PlanState)
    fun deletePlanState(presetId: Long)

    // Session history
    fun recentSessions(limit: Int): List<StudySession>
    fun saveSession(session: StudySession): Long

    // Notes
    fun allNotes(): List<Note>
    fun notesForVerse(verseKey: String): List<Note>
    fun searchNotes(query: String): List<Note>
    fun saveNote(note: Note): Long
    fun deleteNote(id: Long)

    // Settings key/value
    fun settingValue(key: String): String?
    fun setSettingValue(key: String, value: String?)
    fun deleteSettingsWithPrefix(prefix: String)
}

/** SQLite-backed user data store (`ezber-user.sqlite`, shared user schema). */
class SqliteUserDataStore(context: Context) : UserDataStore {

    private val helper = UserDatabase(context)

    // MARK: - Presets

    override fun allPresets(): List<Preset> {
        return query(
            "SELECT ${PRESET_COLUMNS} FROM presets ORDER BY COALESCE(updated_at, created_at) DESC, id DESC",
        ) { cursor -> readPreset(cursor) }
    }

    override fun preset(id: Long): Preset? = query(
        "SELECT $PRESET_COLUMNS FROM presets WHERE id = ?",
        arrayOf(id.toString()),
    ) { cursor -> readPreset(cursor) }.firstOrNull()

    override fun savePreset(preset: Preset): Long {
        val db = helper.writableDatabase
        val now = Iso8601.now()
        db.beginTransaction()
        try {
            val values = ContentValues().apply {
                put("name", preset.name)
                put("surah_id", preset.surahId)
                put("from_ayah", preset.range.start)
                put("to_ayah", preset.range.end)
                put("repeat_count", preset.repeats.defaultRepeats)
                put("reciter_id", preset.reciterId)
                put("transliteration_id", preset.transliterationId)
                put("translation_id", preset.translationId)
                put("show_arabic", if (preset.display.showArabic) 1 else 0)
                put("show_transliteration", if (preset.display.showTransliteration) 1 else 0)
                put("show_translation", if (preset.display.showTranslation) 1 else 0)
                put("pause_between_repeat_ms", preset.display.pauseBetweenRepeatsMs)
                put("playback_mode", preset.display.playbackMode.schemaValue)
                put("download_scope", preset.downloadScope.schemaValue)
                put("created_at", preset.createdAt ?: now)
                put("updated_at", preset.updatedAt ?: now)
                put("last_used_at", preset.lastUsedAt)
            }

            val id = if (preset.id == 0L) {
                db.insertOrThrow("presets", null, values)
            } else {
                values.put("id", preset.id)
                val updated = db.update("presets", values, "id = ?", arrayOf(preset.id.toString()))
                if (updated == 0) db.insertOrThrow("presets", null, values) else preset.id
            }

            db.delete("preset_verses", "preset_id = ?", arrayOf(id.toString()))
            for ((ayah, repeats) in preset.repeats.overrides) {
                db.insertOrThrow(
                    "preset_verses",
                    null,
                    ContentValues().apply {
                        put("preset_id", id)
                        put("ayah", ayah)
                        put("repeat_count", repeats)
                    },
                )
            }

            putSettingValue(db, displayExtrasKey(id), displayExtrasJson(preset.display))
            db.setTransactionSuccessful()
            return id
        } finally {
            db.endTransaction()
        }
    }

    override fun deletePreset(id: Long) {
        val db = helper.writableDatabase
        db.delete("presets", "id = ?", arrayOf(id.toString()))
        db.delete("settings", "key = ?", arrayOf(displayExtrasKey(id)))
        if (lastPresetId() == id) {
            setLastPresetId(null)
        }
    }

    override fun lastUsedPreset(): Preset? {
        val remembered = lastPresetId()?.let(::preset)
        if (remembered != null) return remembered
        return allPresets().maxByOrNull { it.lastUsedAt ?: it.updatedAt ?: it.createdAt ?: "" }
    }

    override fun markPresetUsed(id: Long, at: String) {
        val values = ContentValues().apply {
            put("last_used_at", at)
            put("updated_at", at)
        }
        helper.writableDatabase.update("presets", values, "id = ?", arrayOf(id.toString()))
        setLastPresetId(id)
    }

    override fun lastPresetId(): Long? =
        settingValue(LAST_PRESET_KEY)?.toLongOrNull()

    override fun setLastPresetId(id: Long?) {
        setSettingValue(LAST_PRESET_KEY, id?.toString())
    }

    // MARK: - Progress

    override fun allProgress(): List<VerseProgress> = query(
        "SELECT $PROGRESS_COLUMNS FROM progress ORDER BY verse_key, preset_id",
    ) { cursor -> readProgress(cursor) }

    override fun progressForPreset(presetId: Long): List<VerseProgress> = query(
        "SELECT $PROGRESS_COLUMNS FROM progress WHERE preset_id = ? ORDER BY ayah",
        arrayOf(presetId.toString()),
    ) { cursor -> readProgress(cursor) }

    override fun progressForVerse(verseId: VerseId): List<VerseProgress> = query(
        "SELECT $PROGRESS_COLUMNS FROM progress WHERE verse_key = ? ORDER BY preset_id",
        arrayOf(verseId.reference),
    ) { cursor -> readProgress(cursor) }

    override fun saveProgress(progress: VerseProgress) {
        if (progress.presetId == 0L) return
        val values = ContentValues().apply {
            put("preset_id", progress.presetId)
            put("ayah", progress.verseId.number)
            put("verse_key", progress.verseId.reference)
            put("repetitions_done", progress.repetitionsDone)
            put("memorization_state", progress.state.name.lowercase())
            put("last_played_at", progress.lastPlayedAt)
            put("next_review_at", progress.nextReviewAt)
        }
        helper.writableDatabase.insertWithOnConflict(
            "progress",
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE,
        )
    }

    override fun recordCompletion(item: DrillItem, presetId: Long, at: String) {
        val verseId = item.verse.id
        val existing = progressForPreset(presetId).firstOrNull { it.verseId == verseId }
        val repetitions = (existing?.repetitionsDone ?: 0) + 1
        saveProgress(
            VerseProgress(
                presetId = presetId,
                verseId = verseId,
                repetitionsDone = repetitions,
                state = MemorizationState.derived(repetitions),
                lastPlayedAt = at,
                nextReviewAt = existing?.nextReviewAt,
            ),
        )
    }

    // MARK: - Resume state

    override fun planState(presetId: Long): PlanState? = query(
        "SELECT preset_id, plan_index, position_ms, repetition_counters_json, updated_at " +
            "FROM plan_state WHERE preset_id = ?",
        arrayOf(presetId.toString()),
    ) { cursor ->
        PlanState(
            presetId = cursor.getLong(0),
            planIndex = cursor.getInt(1),
            positionMs = cursor.getLong(2),
            repetitionCountersJson = cursor.stringOrNull(3),
            updatedAt = cursor.stringOrNull(4),
        )
    }.firstOrNull()

    override fun savePlanState(planState: PlanState) {
        val values = ContentValues().apply {
            put("preset_id", planState.presetId)
            put("plan_index", planState.planIndex)
            put("position_ms", planState.positionMs)
            put("repetition_counters_json", planState.repetitionCountersJson)
            put("updated_at", planState.updatedAt ?: Iso8601.now())
        }
        helper.writableDatabase.insertWithOnConflict(
            "plan_state",
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE,
        )
    }

    override fun deletePlanState(presetId: Long) {
        helper.writableDatabase.delete("plan_state", "preset_id = ?", arrayOf(presetId.toString()))
    }

    // MARK: - Session history

    override fun recentSessions(limit: Int): List<StudySession> = query(
        "SELECT id, preset_id, started_at, ended_at, verses_covered, repetitions, interrupted " +
            "FROM sessions ORDER BY started_at DESC LIMIT ?",
        arrayOf(maxOf(1, limit).toString()),
    ) { cursor -> readSession(cursor) }

    override fun saveSession(session: StudySession): Long {
        val db = helper.writableDatabase
        val values = ContentValues().apply {
            put("preset_id", session.presetId)
            put("started_at", session.startedAt)
            put("ended_at", session.endedAt)
            put("verses_covered", session.versesCovered)
            put("repetitions", session.repetitions)
            put("interrupted", if (session.interrupted) 1 else 0)
        }
        if (session.id == 0L) {
            return db.insertOrThrow("sessions", null, values)
        }
        values.put("id", session.id)
        val updated = db.update("sessions", values, "id = ?", arrayOf(session.id.toString()))
        return if (updated == 0) db.insertOrThrow("sessions", null, values) else session.id
    }

    // MARK: - Notes

    override fun allNotes(): List<Note> = query(
        "SELECT $NOTE_COLUMNS FROM notes ORDER BY COALESCE(updated_at, created_at) DESC, id DESC",
    ) { cursor -> readNote(cursor) }

    override fun notesForVerse(verseKey: String): List<Note> = query(
        "SELECT $NOTE_COLUMNS FROM notes WHERE verse_key = ? " +
            "ORDER BY COALESCE(updated_at, created_at) DESC, id DESC",
        arrayOf(verseKey),
    ) { cursor -> readNote(cursor) }

    override fun searchNotes(query: String): List<Note> {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return allNotes()
        return try {
            query(
                "SELECT ${NOTE_COLUMNS_PREFIXED} FROM notes AS n " +
                    "JOIN note_fts AS f ON f.rowid = n.id WHERE note_fts MATCH ? ORDER BY rank",
                arrayOf(trimmed),
            ) { cursor -> readNote(cursor) }
        } catch (_: SQLiteException) {
            // FTS5 unavailable, or the query is not valid FTS syntax.
            this.query(
                "SELECT $NOTE_COLUMNS FROM notes " +
                    "WHERE body_md LIKE ? ORDER BY COALESCE(updated_at, created_at) DESC, id DESC",
                arrayOf("%$trimmed%"),
            ) { cursor -> readNote(cursor) }
        }
    }

    override fun saveNote(note: Note): Long {
        val db = helper.writableDatabase
        val now = Iso8601.now()
        val values = ContentValues().apply {
            put("verse_key", note.verseKey)
            put("body_md", note.bodyMarkdown)
            put("created_at", note.createdAt ?: now)
            put("updated_at", note.updatedAt ?: now)
        }
        if (note.id == 0L) {
            return db.insertOrThrow("notes", null, values)
        }
        values.put("id", note.id)
        val updated = db.update("notes", values, "id = ?", arrayOf(note.id.toString()))
        return if (updated == 0) db.insertOrThrow("notes", null, values) else note.id
    }

    override fun deleteNote(id: Long) {
        helper.writableDatabase.delete("notes", "id = ?", arrayOf(id.toString()))
    }

    // MARK: - Settings

    override fun settingValue(key: String): String? = query(
        "SELECT value FROM settings WHERE key = ?",
        arrayOf(key),
    ) { cursor -> cursor.getString(0) }.firstOrNull()

    override fun setSettingValue(key: String, value: String?) {
        putSettingValue(helper.writableDatabase, key, value)
    }

    override fun deleteSettingsWithPrefix(prefix: String) {
        helper.writableDatabase.delete("settings", "key LIKE ?", arrayOf("$prefix%"))
    }

    private fun putSettingValue(db: SQLiteDatabase, key: String, value: String?) {
        if (value == null) {
            db.delete("settings", "key = ?", arrayOf(key))
        } else {
            db.insertWithOnConflict(
                "settings",
                null,
                ContentValues().apply {
                    put("key", key)
                    put("value", value)
                },
                SQLiteDatabase.CONFLICT_REPLACE,
            )
        }
    }

    // MARK: - Row mapping

    private fun readPreset(cursor: Cursor): Preset {
        val id = cursor.getLong(0)
        return Preset(
            id = id,
            name = cursor.getString(1),
            surahId = cursor.intOrNull(2),
            range = VerseRange(cursor.getInt(3), cursor.getInt(4)),
            repeats = RepeatPlan(
                defaultRepeats = cursor.getInt(5),
                overrides = overridesFor(id),
            ),
            reciterId = cursor.intOrNull(6),
            transliterationId = cursor.intOrNull(7),
            translationId = cursor.intOrNull(8),
            display = displayOptionsFor(id, cursor),
            downloadScope = DownloadScope.fromSchema(cursor.getString(14)),
            createdAt = cursor.stringOrNull(15),
            updatedAt = cursor.stringOrNull(16),
            lastUsedAt = cursor.stringOrNull(17),
        )
    }

    private fun overridesFor(presetId: Long): Map<Int, Int> = query(
        "SELECT ayah, repeat_count FROM preset_verses WHERE preset_id = ?",
        arrayOf(presetId.toString()),
    ) { cursor -> cursor.getInt(0) to cursor.getInt(1) }.toMap()

    private fun displayOptionsFor(presetId: Long, cursor: Cursor): DisplayOptions {
        val extras = settingValue(displayExtrasKey(presetId))
        val json = try {
            extras?.let(::JSONObject)
        } catch (_: Exception) {
            null
        }
        return DisplayOptions(
            showTransliteration = cursor.getInt(10) == 1,
            showArabic = cursor.getInt(9) == 1,
            showTranslation = cursor.getInt(11) == 1,
            translationMode = TranslationMode.fromName(json?.optString("translationMode")),
            transliterationStyle = TransliterationStyle.fromName(json?.optString("transliterationStyle")),
            pauseBetweenRepeatsMs = cursor.getInt(12),
            loopUntilStopped = json?.optBoolean("loopUntilStopped", false) ?: false,
            playbackMode = PlaybackMode.fromSchema(cursor.getString(13)),
        )
    }

    private fun displayExtrasJson(display: DisplayOptions): String = JSONObject()
        .put("translationMode", display.translationMode.name)
        .put("transliterationStyle", display.transliterationStyle.name)
        .put("loopUntilStopped", display.loopUntilStopped)
        .toString()

    private fun displayExtrasKey(presetId: Long): String = "presets.$presetId.display_extras"

    private fun readProgress(cursor: Cursor): VerseProgress {
        val verseKey = cursor.stringOrNull(2)
        val verseId = verseKey?.let { runCatching { VerseId.parse(it) }.getOrNull() }
            ?: VerseId(0, cursor.getInt(1))
        return VerseProgress(
            presetId = cursor.getLong(0),
            verseId = verseId,
            repetitionsDone = cursor.getInt(3),
            state = MemorizationState.fromSchema(cursor.getString(4)),
            lastPlayedAt = cursor.stringOrNull(5),
            nextReviewAt = cursor.stringOrNull(6),
        )
    }

    private fun readSession(cursor: Cursor): StudySession = StudySession(
        id = cursor.getLong(0),
        presetId = cursor.getLong(1),
        startedAt = cursor.getString(2),
        endedAt = cursor.stringOrNull(3),
        versesCovered = cursor.getInt(4),
        repetitions = cursor.getInt(5),
        interrupted = cursor.getInt(6) == 1,
    )

    private fun readNote(cursor: Cursor): Note = Note(
        id = cursor.getLong(0),
        verseKey = cursor.getString(1),
        bodyMarkdown = cursor.getString(2),
        createdAt = cursor.stringOrNull(3),
        updatedAt = cursor.stringOrNull(4),
    )

    private fun <T> query(
        sql: String,
        selectionArgs: Array<String>? = null,
        map: (Cursor) -> T,
    ): List<T> = helper.readableDatabase.rawQuery(sql, selectionArgs).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                add(map(cursor))
            }
        }
    }

    private fun Cursor.stringOrNull(index: Int): String? = if (isNull(index)) null else getString(index)

    private fun Cursor.intOrNull(index: Int): Int? = if (isNull(index)) null else getInt(index)

    companion object {
        private const val LAST_PRESET_KEY = "last_preset_id"

        private const val PRESET_COLUMNS =
            "id, name, surah_id, from_ayah, to_ayah, repeat_count, reciter_id, " +
                "transliteration_id, translation_id, show_arabic, show_transliteration, " +
                "show_translation, pause_between_repeat_ms, playback_mode, download_scope, " +
                "created_at, updated_at, last_used_at"

        private const val PROGRESS_COLUMNS =
            "preset_id, ayah, verse_key, repetitions_done, memorization_state, " +
                "last_played_at, next_review_at"

        private const val NOTE_COLUMNS =
            "id, verse_key, body_md, created_at, updated_at"

        private const val NOTE_COLUMNS_PREFIXED =
            "n.id, n.verse_key, n.body_md, n.created_at, n.updated_at"
    }
}
