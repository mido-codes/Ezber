package app.ezber.android.models

/** Offline-first: downloaded and not-downloaded state must be obvious. */
enum class DownloadState(val label: String) {
    NOT_DOWNLOADED("Not downloaded"),
    DOWNLOADING("Downloading"),
    DOWNLOADED("Downloaded"),
    ;

    companion object {
        fun fromSchema(value: String?): DownloadState = when (value) {
            "downloading" -> DOWNLOADING
            "downloaded" -> DOWNLOADED
            else -> NOT_DOWNLOADED
        }
    }
}
