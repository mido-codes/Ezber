package app.ezber.android.content

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.ezber.android.models.Iso8601
import app.ezber.android.persistence.ContentCache
import app.ezber.android.persistence.SqliteContentStore
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Coarse state of the lazily filled content cache, observed by the screens. */
enum class ContentPhase { IDLE, LOADING, READY, ERROR }

/** Compose-observable snapshot of the content sync engine. */
@Stable
class ContentSyncState {
    var phase by mutableStateOf(ContentPhase.IDLE)
    var message by mutableStateOf<String?>(null)
    var catalogReady by mutableStateOf(false)
    var cachedSurahs by mutableStateOf<Set<Int>>(emptySet())
    var segmentMarkers by mutableStateOf<Map<Pair<Int, Int>, String>>(emptyMap())
    var surahInFlight by mutableStateOf<Set<Int>>(emptySet())
    var surahFailures by mutableStateOf<Map<Int, String>>(emptyMap())
    var segmentFailures by mutableStateOf<Map<Pair<Int, Int>, String>>(emptyMap())
    var counts by mutableStateOf<Map<String, Int>>(emptyMap())
    var files by mutableStateOf<Map<String, ContentBundleFile>>(emptyMap())
    var generatedBy by mutableStateOf<Map<String, String>>(emptyMap())
    var lastFetchedAt by mutableStateOf<String?>(null)
    var lastError by mutableStateOf<String?>(null)
    var licenses by mutableStateOf(LicensesContent(emptyList(), emptyList(), emptyList()))
    var notice by mutableStateOf<String?>(null)

    /** Bumped after every cache write so screens re-read the stores. */
    var revision by mutableIntStateOf(0)

    fun isSurahCached(surahId: Int): Boolean = surahId in cachedSurahs

    fun failureFor(surahId: Int?): String? =
        if (surahId == null) lastError else surahFailures[surahId] ?: lastError

    fun segmentMarker(reciterId: Int, surahId: Int): String? =
        segmentMarkers[reciterId to surahId]
}

/**
 * The Android content layer: fetches the grouped web bundle
 * (`web/CONTENT_BUNDLE.md`) lazily over HTTP and caches what it fetches in
 * `ezber-content.sqlite`, mapped to `schema/content_schema.sql`.
 *
 * Nothing is bulk-imported. `index.json` (surah list and reciter catalogue,
 * with a per-file digest inventory) is the boot request; `surahs/<id>.json`
 * and `segments/<reciter>/<surah>.json` are fetched only when a screen or the
 * audio engine needs them. Fetched bodies are verified against the digest in
 * the index before they are cached.
 */
class ContentRepository(
    private val store: ContentCache,
    private val fetcher: ContentFetcher = HttpContentFetcher(),
    private val baseUrl: () -> String,
    private val now: () -> String = { Iso8601.now() },
) {

    val state = ContentSyncState()

    private val indexGate = Mutex()
    private val pieceGate = Mutex()

    /** The catalogue probe is once per process; Settings can force another. */
    private var probedThisProcess = false

    init {
        val cachedSurahs = store.cachedSurahIds()
        state.cachedSurahs = cachedSurahs
        state.segmentMarkers = store.segmentMarkers()
        state.counts = store.counts()
        state.lastFetchedAt = store.meta(SqliteContentStore.KEY_FETCHED_AT)
        state.catalogReady = store.allSurahs().isNotEmpty()
        readCachedCredits()
    }

    // MARK: - Catalogue

    /**
     * Fetches `index.json` and imports the surah/reciter catalogue. A changed
     * bundle digest clears the cached verse text and timings, which are then
     * refetched on demand; an unchanged digest is a no-op unless [force] was
     * used, which still refetches the catalogue itself.
     */
    suspend fun ensureIndex(force: Boolean = false) {
        indexGate.withLock {
            if (probedThisProcess && !force) return
            state.phase = ContentPhase.LOADING
            state.message = "Fetching content index…"
            state.lastError = null
            try {
                val body = fetcher.fetch(url("index.json"))
                val index = ContentJson.parseIndex(body)
                if (index.layout != "grouped" || index.webBundleVersion < 2) {
                    throw ContentFormatException(
                        "content source has layout '${index.layout}' (version " +
                            "${index.webBundleVersion}); the app needs the grouped bundle " +
                            "(layout 'grouped', version 2)",
                    )
                }
                val digest = index.bundleDigest ?: index.logicalDigest
                val cachedDigest = store.catalogDigest()
                withContext(Dispatchers.IO) {
                    when {
                        cachedDigest == null || cachedDigest != digest ->
                            store.replaceCatalog(index)

                        else -> store.insertCatalog(index)
                    }
                    store.setMeta(SqliteContentStore.KEY_FETCHED_AT, now())
                }
                state.catalogReady = true
                state.cachedSurahs = store.cachedSurahIds()
                state.segmentMarkers = store.segmentMarkers()
                state.counts = if (index.counts.isNotEmpty()) index.counts else store.counts()
                state.files = index.files.associateBy { it.path }
                state.generatedBy = index.generatedBy
                state.lastFetchedAt = now()
                state.surahFailures = emptyMap()
                state.segmentFailures = emptyMap()
                state.phase = ContentPhase.READY
                state.message = null
                probedThisProcess = true
                state.revision++
            } catch (error: Exception) {
                state.lastError = error.message ?: "content index fetch failed"
                state.phase = if (state.catalogReady) ContentPhase.READY else ContentPhase.ERROR
                state.message = state.lastError
            }
        }
    }

    // MARK: - Surah text

    /** Fetches and caches one surah's ayahs, words and transliteration rows. */
    suspend fun ensureSurah(surahId: Int) {
        if (state.isSurahCached(surahId)) return
        state.surahInFlight = state.surahInFlight + surahId
        try {
            pieceGate.withLock {
                if (state.isSurahCached(surahId)) return
                if (!state.catalogReady) ensureIndex()
                val file = state.files["surahs/$surahId.json"]
                val body = fetcher.fetch(url("surahs/$surahId.json"))
                verifyDigest(file, body)
                val payload = ContentJson.parseSurah(body)
                ensureTransliterations()
                withContext(Dispatchers.IO) {
                    store.putSurahContent(payload, file?.sha256)
                }
                state.cachedSurahs = state.cachedSurahs + surahId
                state.surahFailures = state.surahFailures - surahId
                state.counts = store.counts()
                state.lastError = null
                state.revision++
            }
        } catch (error: Exception) {
            state.surahFailures = state.surahFailures + (surahId to errorMessage(error))
        } finally {
            state.surahInFlight = state.surahInFlight - surahId
        }
    }

    // MARK: - Timings

    /** Fetches and caches one reciter's word timings for one surah. */
    suspend fun ensureSegments(reciterId: Int, surahId: Int) {
        val marker = state.segmentMarker(reciterId, surahId)
        if (marker != null) return
        pieceGate.withLock {
            if (state.segmentMarker(reciterId, surahId) != null) return
            if (!state.catalogReady || state.files.isEmpty()) ensureIndex()
            val path = "segments/$reciterId/$surahId.json"
            val file = state.files[path]
            if (file == null && state.files.isEmpty()) {
                // Without a file inventory we cannot tell "no timings" from
                // "index not loaded"; never poison the marker in that case.
                state.segmentFailures = state.segmentFailures +
                    ((reciterId to surahId) to "content index unavailable")
                return
            }
            if (file == null) {
                withContext(Dispatchers.IO) { store.markSegmentsAbsent(reciterId, surahId) }
                state.segmentMarkers = state.segmentMarkers + ((reciterId to surahId) to "absent")
                return
            }
            try {
                val body = fetcher.fetch(url(path))
                verifyDigest(file, body)
                val payload = ContentJson.parseSegments(body)
                withContext(Dispatchers.IO) { store.putSegments(payload, file.sha256) }
                state.segmentMarkers = state.segmentMarkers + ((reciterId to surahId) to "cached")
                state.segmentFailures = state.segmentFailures - (reciterId to surahId)
                state.revision++
            } catch (error: Exception) {
                state.segmentFailures = state.segmentFailures + ((reciterId to surahId) to errorMessage(error))
            }
        }
    }

    // MARK: - Whole-bundle files

    /** The transliteration edition metadata; needed before any surah rows are cached. */
    suspend fun ensureTransliterations() {
        val cached = withContext(Dispatchers.IO) { store.cachedTransliterationEditionCount() }
        if (cached > 0) return
        val file = state.files["transliterations.json"]
        val body = fetcher.fetch(url("transliterations.json"))
        verifyDigest(file, body)
        val editions = ContentJson.parseTransliterations(body)
        withContext(Dispatchers.IO) { store.putTransliterations(editions, file?.sha256) }
    }

    /** The audio catalogue. Fetched on demand, e.g. for reciter availability or playback. */
    suspend fun ensureAudioFiles() {
        val cached = withContext(Dispatchers.IO) { store.hasAudioFiles() }
        if (cached) return
        try {
            val file = state.files["audio-files.json"]
            val body = fetcher.fetch(url("audio-files.json"))
            verifyDigest(file, body)
            val files = ContentJson.parseAudioFiles(body)
            withContext(Dispatchers.IO) { store.putAudioFiles(files, file?.sha256) }
            state.revision++
        } catch (error: Exception) {
            state.lastError = errorMessage(error)
        }
    }

    // MARK: - Credits

    /** Fetches `licenses.json` and the notice text shown on the credits screen. */
    suspend fun loadCredits(force: Boolean = false) {
        if (!force && state.licenses.licenses.isNotEmpty()) return
        try {
            val body = fetcher.fetch(url("licenses.json"))
            val licenses = ContentJson.parseLicenses(body)
            val noticeEntry = licenses.notices.firstOrNull()
            val notice = noticeEntry?.let { entry ->
                runCatching {
                    val text = fetcher.fetch(url(entry.path))
                    verifyDigest(entry.sha256, text)
                    text
                }.getOrNull()
            }
            withContext(Dispatchers.IO) {
                store.setMeta(SqliteContentStore.KEY_LICENSES_BODY, body)
                store.setMeta(SqliteContentStore.KEY_NOTICE_TEXT, notice)
                store.setMeta(SqliteContentStore.KEY_NOTICE_PATH, noticeEntry?.path)
            }
            state.licenses = licenses
            state.notice = notice
        } catch (error: Exception) {
            state.lastError = errorMessage(error)
            if (state.licenses.licenses.isEmpty()) readCachedCredits()
        }
    }

    private fun readCachedCredits() {
        val body = store.meta(SqliteContentStore.KEY_LICENSES_BODY)
        if (body != null) {
            state.licenses = runCatching { ContentJson.parseLicenses(body) }.getOrDefault(state.licenses)
        }
        state.notice = store.meta(SqliteContentStore.KEY_NOTICE_TEXT)
    }

    // MARK: - Plumbing

    /** Resolves a bundle-relative path against the configured base URL. */
    fun url(path: String): String =
        baseUrl().trim().trimEnd('/') + "/" + path.trimStart('/')

    private fun verifyDigest(file: ContentBundleFile?, body: String) {
        verifyDigest(file?.sha256, body)
    }

    private fun verifyDigest(expected: String?, body: String) {
        if (expected.isNullOrBlank()) return
        val prefix = expected.substringBefore(':', "")
        if (!prefix.equals("sha256", ignoreCase = true)) return
        val hex = expected.substringAfter(':')
        val actual = MessageDigest.getInstance("SHA-256")
            .digest(body.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
        if (!actual.equals(hex, ignoreCase = true)) {
            throw ContentFormatException("content digest mismatch: expected $expected, got sha256:$actual")
        }
    }

    private fun errorMessage(error: Exception): String =
        when (error) {
            is ContentFetchException, is ContentFormatException -> error.message.orEmpty()
            else -> error.message ?: error.javaClass.simpleName
        }
}
