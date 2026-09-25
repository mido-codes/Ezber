package app.ezber.android.models

/**
 * A reciter whose audio can be streamed or downloaded. The real content
 * pipeline fills these from the `reciters` table; placeholder values are used
 * until it lands.
 */
data class Reciter(
    val id: Int,
    val remoteId: String,
    val name: String,
    val style: String? = null,
    val qirat: String? = null,
    val attribution: String = "",
    val licenseId: String = "",
    val hasSegments: Boolean = false,
    val enabled: Boolean = true,
) {
    val subtitle: String get() = listOfNotNull(style, qirat).filter { it.isNotBlank() }.joinToString(" · ")
}
