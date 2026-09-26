package app.ezber.android.features.credits

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.LoadingState
import app.ezber.android.ui.ScreenScaffold

/**
 * Text, transliteration and reciter attributions, read from the content
 * bundle's `licenses.json` plus the reciter catalogue, with the Tanzil notice
 * fetched verbatim from the bundle.
 */
@Composable
fun CreditsScreen(app: AppEnvironment, onBack: () -> Unit) {
    val repository = app.contentRepository
    var attempted by remember { mutableStateOf(false) }
    LaunchedEffect(repository) {
        repository?.loadCredits()
        attempted = true
    }

    ScreenScaffold(title = stringResource(R.string.title_credits), onBack = onBack) { padding ->
        val contentRevision = repository?.state?.revision ?: 0
        val licenses = remember(contentRevision) { repository?.state?.licenses }
        val notice = remember(contentRevision) { repository?.state?.notice }
        val reciters = remember(contentRevision) { app.content.allReciters() }
        val counts = remember(contentRevision) { repository?.state?.counts.orEmpty() }

        if (!attempted && (licenses?.licenses.isNullOrEmpty())) {
            LoadingState("Loading credits…", Modifier.padding(padding))
            return@ScreenScaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            EzberCard {
                Text("App", style = MaterialTheme.typography.titleMedium)
                Text("Ezber", style = MaterialTheme.typography.bodyLarge)
                Text(
                    text = "A Quran memorization and listening app for iPhone and Android, " +
                        "offline-first and built on a shared content pipeline.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            if (counts.isNotEmpty()) {
                EzberCard {
                    Text("Bundled content", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = "${counts["surahs"] ?: 0} surahs · ${counts["ayahs"] ?: 0} ayahs · " +
                            "${counts["words"] ?: 0} words · ${counts["reciters"] ?: 0} reciters · " +
                            "${counts["segments"] ?: 0} timing rows",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        text = "Quran text from the Tanzil Project (Tanzil Uthmani 1.1), " +
                            "verbatim and unmodified.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            val licenseEntries = licenses?.licenses.orEmpty()
            if (licenseEntries.isNotEmpty()) {
                CreditSection(
                    title = "Licenses",
                    rows = licenseEntries.map { license ->
                        CreditRow(
                            title = license.name,
                            source = license.id,
                            license = "",
                            url = license.url,
                        )
                    },
                )
            }

            val attributions = licenses?.attributions.orEmpty()
            if (attributions.isNotEmpty()) {
                CreditSection(
                    title = "Attributions",
                    rows = attributions.map { attribution ->
                        CreditRow(
                            title = attribution.sourceId ?: attribution.sourceKind
                                ?: attribution.licenseId,
                            source = attribution.text,
                            license = attribution.licenseId,
                            url = null,
                        )
                    },
                )
            }

            if (reciters.isNotEmpty()) {
                CreditSection(
                    title = "Reciters",
                    rows = reciters.map { reciter ->
                        CreditRow(
                            title = reciter.name,
                            source = reciter.attribution.ifEmpty { reciter.remoteId },
                            license = buildString {
                                append(reciter.licenseId)
                                if (!reciter.enabled) append(" · rights pending")
                            },
                            url = reciter.licenseUrl.ifEmpty { reciter.licenseEvidenceUrl }
                                .ifEmpty { null },
                        )
                    },
                )
            }

            if (notice != null) {
                EzberCard {
                    Text("Tanzil notice", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = notice,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else if (repository == null) {
                EzberCard {
                    Text("Credits", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = "The license registry is fetched with the content bundle " +
                            "and appears here once the bundle loads.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            EzberCard {
                Text("Open source", style = MaterialTheme.typography.titleMedium)
                Text("SQLite, bundled with Android.")
                Text("Jetpack Compose and AndroidX, Google.")
            }

            EzberCard {
                Text("Content stores", style = MaterialTheme.typography.titleMedium)
                Text(app.contentStoreDescription, style = MaterialTheme.typography.bodySmall)
                Text(app.userStoreDescription, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private data class CreditRow(
    val title: String,
    val source: String,
    val license: String,
    val url: String?,
)

@Composable
private fun CreditSection(title: String, rows: List<CreditRow>) {
    EzberCard {
        Text(title, style = MaterialTheme.typography.titleMedium)
        for (row in rows) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(row.title, style = MaterialTheme.typography.bodyLarge)
                if (row.source.isNotEmpty()) {
                    Text(row.source, style = MaterialTheme.typography.bodyMedium)
                }
                if (row.license.isNotEmpty()) {
                    Text(
                        text = row.license,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (row.url != null) {
                    Text(
                        text = row.url,
                        style = MaterialTheme.typography.labelMedium,
                        textDecoration = TextDecoration.Underline,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
        }
    }
}
