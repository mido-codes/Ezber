package app.ezber.android.models

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * ISO-8601 UTC timestamps exactly as schema/user_schema.sql stores them
 * ("2026-09-25T12:00:00.000Z"), so exports round-trip between the iOS and
 * Android apps.
 */
object Iso8601 {

    private val formatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC)

    private val displayFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm").withZone(ZoneId.systemDefault())

    fun now(): String = formatter.format(Instant.now())

    fun format(instant: Instant): String = formatter.format(instant)

    fun parse(value: String?): Instant? {
        if (value.isNullOrBlank()) return null
        return try {
            Instant.parse(value)
        } catch (_: DateTimeParseException) {
            null
        }
    }

    /** Human-readable local time, or the given fallback when absent. */
    fun display(value: String?, fallback: String = "Never"): String {
        val instant = parse(value) ?: return fallback
        return displayFormatter.format(instant)
    }
}
