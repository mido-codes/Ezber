package app.ezber.android.content

import app.ezber.android.models.Reciter
import app.ezber.android.models.RevelationPlace
import app.ezber.android.models.Surah
import org.json.JSONArray
import org.json.JSONObject

/** A malformed or unsupported content payload. */
class ContentFormatException(message: String) : Exception(message)

/**
 * Parser for the grouped web content bundle (`web/CONTENT_BUNDLE.md`).
 *
 * The bundle is a pipeline projection of `schema/content_schema.sql`, so every
 * table arrives as a `{"columns": [...], "rows": [[...]]}` document or as an
 * array of objects. This parser decodes both, then addresses fields by name so
 * a column reorder does not silently misread rows.
 */
object ContentJson {

    // MARK: - Entry points

    fun parseIndex(body: String): ContentIndex {
        val root = objectOf(body, "index.json")
        val layout = root.string("layout") ?: "single"
        return ContentIndex(
            webBundleVersion = root.number("web_bundle_version")?.toInt()
                ?: root.number("schema_version")?.toInt()
                ?: 1,
            layout = layout,
            bundleDigest = root.string("bundle_digest", "bundle_id", "logical_digest"),
            logicalDigest = root.string("logical_digest"),
            schemaVersion = root.number("schema_version")?.toInt(),
            contentMode = root.string("content_mode"),
            generatedBy = root.objectOrNull("generated_by")?.let { generated ->
                generated.keys().asSequence().associateWith { key -> generated.optString(key) }
            }.orEmpty(),
            counts = root.objectOrNull("counts")?.toIntMap().orEmpty(),
            surahs = tableRows(root.opt("surahs") ?: root.opt("chapters")).mapNotNull(::surah),
            reciters = tableRows(root.opt("reciters")).mapNotNull(::reciter),
            files = objectRows(root.opt("files")).mapNotNull(::bundleFile),
        )
    }

    fun parseSurah(body: String): SurahContent {
        val root = objectOf(body, "surah file")
        val surahId = root.number("surah_id", "id")?.toInt()
            ?: throw ContentFormatException("surah file has no surah_id")
        return SurahContent(
            surahId = surahId,
            ayahs = tableRows(root.opt("ayahs") ?: root.opt("verses")).mapNotNull(::ayah),
            transliterationRows = tableRows(root.opt("transliteration_rows") ?: root.opt("rows"))
                .mapNotNull(::transliterationRow),
            words = tableRows(root.opt("words")).mapNotNull(::word),
        )
    }

    fun parseSegments(body: String): SegmentContent {
        val root = objectOf(body, "segments file")
        val reciterId = root.number("reciter_id")?.toInt()
            ?: throw ContentFormatException("segments file has no reciter_id")
        val surahId = root.number("surah_id")?.toInt()
            ?: throw ContentFormatException("segments file has no surah_id")
        val variant = root.string("variant") ?: "default"
        return SegmentContent(
            reciterId = reciterId,
            surahId = surahId,
            variant = variant,
            rows = tableRows(if (root.has("columns")) root else root.opt("segments"))
                .mapNotNull(::segment),
        )
    }

    fun parseTransliterations(body: String): List<TransliterationEdition> {
        val root = runCatching { JSONObject(body) }.getOrNull()
        val rows = when {
            root != null && root.has("columns") -> tableRows(root)
            root != null -> tableRows(root.opt("transliterations") ?: root.opt("editions") ?: root)
            else -> tableRows(runCatching { JSONArray(body) }.getOrNull() ?: return emptyList())
        }
        return rows.mapNotNull { row ->
            val id = row.number("id", "transliteration_id")?.toInt() ?: return@mapNotNull null
            TransliterationEdition(
                id = id,
                resourceId = row.string("resource_id").orEmpty(),
                name = row.string("name").orEmpty(),
                author = row.string("author"),
                language = row.string("language").orEmpty(),
                source = row.string("source").orEmpty(),
                licenseId = row.string("license_id").orEmpty(),
                licenseUrl = row.string("license_url").orEmpty(),
                licenseEvidenceUrl = row.string("license_evidence_url").orEmpty(),
                attribution = row.string("attribution").orEmpty(),
            )
        }
    }

    fun parseAudioFiles(body: String): List<AudioFileContent> =
        tableRows(runCatching { JSONObject(body) }.getOrNull()?.let { root ->
            if (root.has("columns")) root else root.opt("audio_files") ?: root
        }).mapNotNull(::audioFile)

    fun parseLicenses(body: String): LicensesContent {
        val root = objectOf(body, "licenses.json")
        return LicensesContent(
            licenses = objectRows(root.opt("licenses")).mapNotNull { row ->
                val id = row.string("id", "key", "name") ?: return@mapNotNull null
                LicenseEntry(
                    id = id,
                    name = row.string("name", "title") ?: id,
                    url = row.string("url"),
                )
            },
            attributions = objectRows(root.opt("attributions")).mapNotNull { row ->
                val text = row.string("text") ?: return@mapNotNull null
                AttributionLine(
                    licenseId = row.string("license_id").orEmpty(),
                    text = text,
                    sourceKind = row.string("source_kind"),
                    sourceId = row.string("source_id"),
                )
            },
            notices = objectRows(root.opt("notices")).mapNotNull { row ->
                val path = row.string("path") ?: return@mapNotNull null
                NoticeEntry(
                    path = path,
                    sha256 = row.string("sha256"),
                    bytes = row.number("bytes")?.toLong(),
                )
            },
        )
    }

    // MARK: - Row mappers

    private fun surah(row: Map<String, Any?>): Surah? {
        val id = row.number("id", "surah_id")?.toInt() ?: return null
        val verseCount = row.number("verses_count", "verse_count", "verses", "ayahs_count")
            ?.toInt() ?: return null
        return Surah(
            id = id,
            nameArabic = row.string("name_arabic", "arabic", "nameArabic").orEmpty(),
            nameLatin = row.string("name_latin", "latin", "nameLatin", "name").orEmpty(),
            nameEnglish = row.string("name_english", "english", "nameEnglish", "tname").orEmpty(),
            verseCount = verseCount,
            revelationPlace = RevelationPlace.fromSchema(
                row.string("revelation", "revelation_place", "place"),
            ),
            bismillahPre = row.bool("bismillah_pre", "bismillahPre") ?: false,
        )
    }

    private fun reciter(row: Map<String, Any?>): Reciter? {
        val id = row.number("id", "reciter_id")?.toInt() ?: return null
        return Reciter(
            id = id,
            remoteId = row.string("remote_id", "resource_id", "slug") ?: "reciter-$id",
            name = row.string("name") ?: "Reciter $id",
            style = row.string("style"),
            qirat = row.string("qirat"),
            attribution = row.string("attribution").orEmpty(),
            licenseId = row.string("license_id").orEmpty(),
            licenseUrl = row.string("license_url").orEmpty(),
            licenseEvidenceUrl = row.string("license_evidence_url").orEmpty(),
            source = row.string("source").orEmpty(),
            hasSegments = row.bool("has_segments") ?: false,
            enabled = row.bool("enabled") ?: true,
        )
    }

    private fun bundleFile(row: Map<String, Any?>): ContentBundleFile? {
        val path = row.string("path") ?: return null
        return ContentBundleFile(
            path = path,
            kind = row.string("kind"),
            sha256 = row.string("sha256"),
            bytes = row.number("bytes")?.toLong(),
            surahId = row.number("surah_id")?.toInt(),
            reciterId = row.number("reciter_id")?.toInt(),
            variant = row.string("variant"),
        )
    }

    private fun ayah(row: Map<String, Any?>): CachedAyah? {
        val id = row.number("id", "ayah_id")?.toInt() ?: return null
        val surahId = row.number("surah_id", "surah")?.toInt() ?: return null
        val ayah = row.number("ayah", "number", "verse_number")?.toInt() ?: return null
        return CachedAyah(
            id = id,
            surahId = surahId,
            ayah = ayah,
            verseKey = row.string("verse_key") ?: "$surahId:$ayah",
            textUthmani = row.string("text_uthmani", "arabic") ?: return null,
            transliteration = row.string("transliteration", "translit"),
            juz = row.number("juz")?.toInt(),
            hizb = row.number("hizb")?.toInt(),
            page = row.number("page")?.toInt(),
            sajdah = row.bool("sajdah") ?: false,
            sajdahType = row.string("sajdah_type"),
        )
    }

    private fun transliterationRow(row: Map<String, Any?>): CachedTransliterationRow? {
        val ayahId = row.number("ayah_id")?.toInt() ?: return null
        val text = row.string("text", "transliteration") ?: return null
        return CachedTransliterationRow(
            transliterationId = row.number("transliteration_id")?.toInt() ?: 1,
            ayahId = ayahId,
            text = text,
        )
    }

    private fun word(row: Map<String, Any?>): CachedWord? {
        val ayahId = row.number("ayah_id")?.toInt() ?: return null
        val position = row.number("position", "index", "word_index")?.toInt() ?: return null
        return CachedWord(
            id = row.number("id")?.toInt() ?: 0,
            ayahId = ayahId,
            position = position,
            textUthmani = row.string("text_uthmani", "uthmani"),
            transliteration = row.string("transliteration", "text", "translit").orEmpty()
                .ifEmpty { return null },
            translation = row.string("translation"),
        )
    }

    private fun segment(row: Map<String, Any?>): CachedSegment? {
        val ayahId = row.number("ayah_id")?.toInt() ?: return null
        val wordIndex = row.number("word_index", "index", "word")?.toInt() ?: return null
        val start = row.number("start_ms", "start")?.toLong() ?: return null
        val end = row.number("end_ms", "end")?.toLong() ?: return null
        return CachedSegment(ayahId = ayahId, wordIndex = wordIndex, startMs = start, endMs = end)
    }

    private fun audioFile(row: Map<String, Any?>): AudioFileContent? {
        val id = row.number("id")?.toInt() ?: return null
        val reciterId = row.number("reciter_id")?.toInt() ?: return null
        val url = row.string("url", "audio_url", "src") ?: return null
        val kind = row.string("kind")?.lowercase() ?: if (row.number("ayah") != null) "ayah" else "chapter"
        return AudioFileContent(
            id = id,
            reciterId = reciterId,
            kind = kind,
            surahId = row.number("surah_id", "surah")?.toInt(),
            ayah = row.number("ayah")?.toInt(),
            chapter = row.number("chapter")?.toInt(),
            variant = row.string("variant") ?: "default",
            url = url,
            bytes = row.number("bytes", "size")?.toLong(),
            bitrate = row.number("bitrate")?.toInt(),
            durationMs = row.number("duration_ms", "duration")?.toLong(),
            checksum = row.string("checksum", "sha1"),
        )
    }

    // MARK: - Shape helpers

    private fun objectOf(body: String, what: String): JSONObject =
        try {
            JSONObject(body)
        } catch (error: Exception) {
            throw ContentFormatException("$what is not a JSON object: ${error.message}")
        }

    /**
     * Decodes any table value into named rows: a `{"columns", "rows"}` document,
     * an array of row objects, or a wrapper object holding one of those under a
     * data key.
     */
    fun tableRows(value: Any?): List<Map<String, Any?>> {
        val decoded = decodeTable(value)
        if (decoded != null) return decoded
        val record = value as? JSONObject ?: return emptyList()
        for (key in listOf("rows", "data", "items", "entries")) {
            val nested = decodeTable(record.opt(key))
            if (nested != null) return nested
        }
        return emptyList()
    }

    private fun objectRows(value: Any?): List<Map<String, Any?>> {
        val array = value as? JSONArray
        if (array != null) {
            return (0 until array.length()).mapNotNull { index ->
                (array.opt(index) as? JSONObject)?.toStringMap()
            }
        }
        val record = value as? JSONObject ?: return emptyList()
        return listOf(record.toStringMap())
    }

    private fun decodeTable(value: Any?): List<Map<String, Any?>>? {
        when (value) {
            is JSONArray -> return (0 until value.length()).mapNotNull { index ->
                (value.opt(index) as? JSONObject)?.toStringMap()
            }

            is JSONObject -> {
                val columns = value.optJSONArray("columns") ?: return null
                val rows = value.optJSONArray("rows") ?: return null
                return (0 until rows.length()).mapNotNull { rowIndex ->
                    val row = rows.optJSONArray(rowIndex) ?: return@mapNotNull null
                    val mapped = linkedMapOf<String, Any?>()
                    for (columnIndex in 0 until columns.length()) {
                        val name = columns.optString(columnIndex)
                        mapped[name] = if (row.isNull(columnIndex)) null else row.opt(columnIndex)
                    }
                    mapped
                }
            }
        }
        return null
    }

    private fun JSONObject.toStringMap(): Map<String, Any?> =
        keys().asSequence().associateWith { key -> if (isNull(key)) null else opt(key) }

    private fun JSONObject.objectOrNull(key: String): JSONObject? = opt(key) as? JSONObject

    private fun JSONObject.toIntMap(): Map<String, Int> =
        keys().asSequence().mapNotNull { key ->
            number(key)?.let { value -> key to value.toInt() }
        }.toMap()

    private fun JSONObject.string(vararg keys: String): String? =
        keys.firstNotNullOfOrNull { key -> (opt(key) as? String)?.takeIf { it.isNotEmpty() } }

    private fun JSONObject.number(vararg keys: String): Number? =
        keys.firstNotNullOfOrNull { key -> opt(key) as? Number }

    private fun Map<String, Any?>.string(vararg keys: String): String? =
        keys.firstNotNullOfOrNull { key -> this[key]?.let(::asString)?.takeIf { it.isNotEmpty() } }

    private fun Map<String, Any?>.number(vararg keys: String): Number? =
        keys.firstNotNullOfOrNull { key -> this[key]?.let(::asNumber) }

    private fun Map<String, Any?>.bool(vararg keys: String): Boolean? =
        keys.firstNotNullOfOrNull { key -> this[key]?.let(::asBoolean) }

    private fun asString(value: Any?): String? = when (value) {
        null, JSONObject.NULL -> null
        is String -> value
        is Number -> value.toString()
        else -> null
    }

    private fun asNumber(value: Any?): Number? = when (value) {
        null, JSONObject.NULL -> null
        is Number -> value
        is String -> value.toIntOrNull() ?: value.toLongOrNull() ?: value.toDoubleOrNull()
        else -> null
    }

    private fun asBoolean(value: Any?): Boolean? = when (value) {
        null, JSONObject.NULL -> null
        is Boolean -> value
        is Number -> value.toInt() != 0
        is String -> when (value.lowercase()) {
            "1", "true", "yes" -> true
            "0", "false", "no", "" -> false
            else -> null
        }

        else -> null
    }
}
