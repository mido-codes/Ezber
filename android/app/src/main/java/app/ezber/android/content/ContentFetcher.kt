package app.ezber.android.content

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** A non-successful content fetch (network failure, HTTP error). */
class ContentFetchException(message: String, cause: Throwable? = null) : IOException(message, cause)

/** Fetches content bundle bodies by URL. Tests supply a fake implementation. */
interface ContentFetcher {
    suspend fun fetch(url: String): String
}

/** Minimal `HttpURLConnection` client; no third-party networking dependency. */
class HttpContentFetcher : ContentFetcher {

    override suspend fun fetch(url: String): String = withContext(Dispatchers.IO) {
        val connection = try {
            URL(url).openConnection() as HttpURLConnection
        } catch (error: Exception) {
            throw ContentFetchException("cannot open $url: ${error.message}", error)
        }
        try {
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json, text/plain, */*")
            val status = connection.responseCode
            if (status !in 200..299) {
                throw ContentFetchException("$url: HTTP $status")
            }
            connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (error: ContentFetchException) {
            throw error
        } catch (error: Exception) {
            throw ContentFetchException("$url: ${error.message}", error)
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 25_000
    }
}
