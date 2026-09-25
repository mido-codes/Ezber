package app.ezber.android.audio

import app.ezber.android.models.AudioFileEntry
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * On-demand local cache for the content bundle's audio manifest.
 *
 * The manifest (`audio_files` in `ezber-content.sqlite`) points at upstream
 * URLs; the drill engine resolves a verse to a manifest row and this cache
 * downloads it once into the app's private files directory, verifying the
 * build-time `bytes`/`checksum` when the bundle carries them. Playback always
 * uses a local file, so a cached drill keeps working offline.
 *
 * There is deliberately no placeholder fallback: a missing manifest row or a
 * failed download surfaces as a playback error instead of fake audio.
 */
class AudioCache(
    private val root: File,
) {

    constructor(context: android.content.Context) :
        this(File(context.applicationContext.filesDir, DEFAULT_DIRECTORY))

    private val locks = ConcurrentHashMap<String, Mutex>()

    /** The cached file for [entry], or null when it is absent or incomplete. */
    fun cachedFile(entry: AudioFileEntry): File? {
        val file = fileFor(entry)
        if (!file.isFile) return null
        val expected = entry.bytes
        if (expected != null && expected > 0 && file.length() != expected) return null
        return file
    }

    fun isCached(entry: AudioFileEntry): Boolean = cachedFile(entry) != null

    /**
     * Returns the local file for [entry], downloading it first when needed.
     * Concurrent requests for the same manifest row share one download.
     */
    suspend fun ensureCached(
        entry: AudioFileEntry,
        onProgress: ((bytesReceived: Long, totalBytes: Long?) -> Unit)? = null,
    ): File {
        cachedFile(entry)?.let { return it }
        val lock = locks.getOrPut(entry.cacheKey) { Mutex() }
        return lock.withLock {
            cachedFile(entry)?.let { return@withLock it }
            withContext(Dispatchers.IO) { download(entry, onProgress) }
        }
    }

    fun remove(entry: AudioFileEntry): Boolean = fileFor(entry).delete()

    fun fileFor(entry: AudioFileEntry): File =
        File(File(root, entry.reciterId.toString()), fileName(entry))

    private fun fileName(entry: AudioFileEntry): String = buildString {
        append(entry.variant.ifBlank { "default" }.replace(UNSAFE, "_"))
        append('-').append(entry.kind)
        entry.chapter?.let { append("-ch").append(it) }
        entry.ayah?.let { append("-ay").append(it) }
        append('-').append(entry.id)
        append('.').append(extensionFor(entry.url))
    }

    private fun download(
        entry: AudioFileEntry,
        onProgress: ((bytesReceived: Long, totalBytes: Long?) -> Unit)?,
    ): File {
        if (!entry.url.startsWith("http://") && !entry.url.startsWith("https://")) {
            throw IOException("Unsupported audio URL in the content bundle: ${entry.url}")
        }
        val destination = fileFor(entry)
        destination.parentFile?.mkdirs()
        val temporary = File(destination.parentFile, destination.name + ".part")
        val connection = (URL(entry.url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("Accept-Encoding", "identity")
        }
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IOException("HTTP $status downloading ${entry.url}")
            }
            val expectedLength = entry.bytes?.takeIf { it > 0 }
                ?: connection.contentLengthLong.takeIf { it > 0 }
            val expectedDigest = entry.checksum?.removePrefix("sha1:")?.lowercase()
            val digest = if (expectedDigest?.length == 40) MessageDigest.getInstance("SHA-1") else null

            var received = 0L
            connection.inputStream.use { input ->
                temporary.outputStream().use { output ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest?.update(buffer, 0, read)
                        received += read
                        onProgress?.invoke(received, expectedLength)
                    }
                }
            }

            if (expectedLength != null && received != expectedLength) {
                throw IOException(
                    "Expected $expectedLength bytes but fetched $received for ${entry.url}",
                )
            }
            if (digest != null && expectedDigest != null) {
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                if (actual != expectedDigest) {
                    throw IOException("Checksum mismatch for ${entry.url}")
                }
            }

            if (destination.exists() && !destination.delete()) {
                throw IOException("Could not replace cached audio ${destination.name}")
            }
            if (!temporary.renameTo(destination)) {
                throw IOException("Could not store cached audio ${destination.name}")
            }
            return destination
        } finally {
            temporary.delete()
            connection.disconnect()
        }
    }

    companion object {
        const val DEFAULT_DIRECTORY = "audio-cache"

        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000
        private const val BUFFER_SIZE = 64 * 1024

        private val UNSAFE = Regex("[^A-Za-z0-9._-]")
        private val KNOWN_EXTENSIONS = setOf(
            "mp3", "m4a", "mp4", "aac", "ogg", "opus", "wav", "flac", "webm",
        )

        /** File extension for a manifest URL, defaulting to mp3. */
        fun extensionFor(url: String): String {
            val path = runCatching { URI(url).path }.getOrNull() ?: url
            val extension = path.substringAfterLast('.', "").lowercase()
            return if (extension in KNOWN_EXTENSIONS) extension else "mp3"
        }
    }
}
