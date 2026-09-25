package app.ezber.android.audio

import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import app.ezber.android.models.DrillItem
import app.ezber.android.models.Preset
import app.ezber.android.models.Surah
import app.ezber.android.services.DrillAudioItem

/**
 * The stable identities and metadata that tie the app's verse × repetition plan
 * to Media3: one `MediaItem` per repeat, keyed by the preset and the shared
 * `verse_key`, with the verse/repeat fields Android Auto and the lock screen
 * read back.
 */
object DrillMedia {

    const val ROOT_MEDIA_ID = "ezber:root"
    private const val PRESET_PREFIX = "ezber:preset:"
    private const val DRILL_PREFIX = "ezber:drill:"

    const val EXTRA_PRESET_ID = "ezber.presetId"
    const val EXTRA_VERSE_KEY = "ezber.verseKey"
    const val EXTRA_VERSE_NUMBER = "ezber.verseNumber"
    const val EXTRA_REPEAT_INDEX = "ezber.repeatIndex"
    const val EXTRA_REPEAT_COUNT = "ezber.repeatCount"

    /** Browse-tree identity for a saved preset. */
    fun presetMediaId(presetId: Long): String = "$PRESET_PREFIX$presetId"

    /** Stable plan identity: preset + verse key + repeat number. */
    fun drillMediaId(presetId: Long, item: DrillItem): String =
        "$DRILL_PREFIX$presetId:${item.verse.reference}#${item.repeatIndex}"

    fun presetIdFromMediaId(mediaId: String): Long? =
        mediaId.removePrefix(PRESET_PREFIX).takeIf { mediaId.startsWith(PRESET_PREFIX) }?.toLongOrNull()

    /** A playable (browsable) preset entry for the Android Auto tree. */
    fun presetBrowseItem(preset: Preset, surah: Surah?): MediaItem = MediaItem.Builder()
        .setMediaId(presetMediaId(preset.id))
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(preset.name)
                .setSubtitle(
                    listOfNotNull(
                        surah?.nameLatin,
                        preset.range.displayString,
                        preset.repeatSummary,
                    ).joinToString(" · "),
                )
                .setAlbumTitle(surah?.nameLatin)
                .setIsBrowsable(false)
                .setIsPlayable(true)
                .build(),
        )
        .build()

    fun rootBrowseItem(title: String): MediaItem = MediaItem.Builder()
        .setMediaId(ROOT_MEDIA_ID)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                .build(),
        )
        .build()
}

/** Converts the engine's transport-neutral item into a Media3 item. */
fun DrillAudioItem.toMediaItem(): MediaItem {
    val extrasBundle = Bundle().apply {
        extras.forEach { (key, value) -> putString(key, value) }
    }
    return MediaItem.Builder()
        .setMediaId(mediaId)
        .setUri(uri)
        .setMimeType(mimeType)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title ?: verseKey)
                .setSubtitle(subtitle)
                .setAlbumTitle(albumTitle)
                .setArtist(artist)
                .setExtras(extrasBundle)
                .build(),
        )
        .build()
}

/** Reads a Media3 item back into the shape the engine's listener speaks. */
fun MediaItem.toDrillAudioItem(): DrillAudioItem {
    val extras = mediaMetadata.extras
    return DrillAudioItem(
        id = mediaId,
        uri = localConfiguration?.uri?.toString(),
        mediaId = mediaId,
        verseKey = extras?.getString(DrillMedia.EXTRA_VERSE_KEY).orEmpty(),
        repeatIndex = extras?.getInt(DrillMedia.EXTRA_REPEAT_INDEX) ?: 0,
        mimeType = localConfiguration?.mimeType,
        title = mediaMetadata.title?.toString(),
        subtitle = mediaMetadata.subtitle?.toString(),
        albumTitle = mediaMetadata.albumTitle?.toString(),
        artist = mediaMetadata.artist?.toString(),
        extras = extras?.let { bundle ->
            bundle.keySet().associateWith { key -> bundle.getString(key).orEmpty() }
        }.orEmpty(),
    )
}
