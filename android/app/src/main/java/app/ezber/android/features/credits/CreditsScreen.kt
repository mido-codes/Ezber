package app.ezber.android.features.credits

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.ScreenScaffold

/**
 * Text, transliteration, translation and reciter attributions with their
 * licenses. Provisional for this slice: the authoritative registry is owned by
 * the rights work at `licenses/registry.json` in the repository root.
 */
@Composable
fun CreditsScreen(app: AppEnvironment, onBack: () -> Unit) {
    ScreenScaffold(title = stringResource(R.string.title_credits), onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CreditSection(
                title = "App",
                rows = listOf(
                    CreditRow(
                        title = "Ezber",
                        source = "A quiet Quran memorization and listening app, built with Kotlin and Jetpack Compose.",
                        license = "",
                        url = null,
                    ),
                ),
            )

            CreditSection(
                title = "Quran text",
                rows = listOf(
                    CreditRow(
                        title = "Arabic text",
                        source = "Tanzil.net Uthmani text",
                        license = "CC BY 3.0",
                        url = "https://tanzil.net",
                    ),
                ),
            )

            CreditSection(
                title = "Transliteration",
                rows = listOf(
                    CreditRow(
                        title = "Transliteration",
                        source = "Quran.com / Quran Foundation",
                        license = "Pending — tracked in the licenses/ registry",
                        url = "https://quran.com",
                    ),
                ),
            )

            CreditSection(
                title = "Translation",
                rows = listOf(
                    CreditRow(
                        title = "English translation",
                        source = "M. M. Pickthall, The Meaning of the Glorious Koran",
                        license = "Public domain",
                        url = "https://www.gutenberg.org/ebooks/16955",
                    ),
                ),
            )

            CreditSection(
                title = "Audio",
                rows = listOf(
                    CreditRow(
                        title = "Recitation",
                        source = "Dhikr Al-Huda (placeholder reciter)",
                        license = "CC BY 4.0 — placeholder, rights pending",
                        url = "https://archive.org",
                    ),
                ),
            )

            EzberCard {
                Text("Open source", style = MaterialTheme.typography.titleMedium)
                Text("SQLite, bundled with Android.")
                Text("Jetpack Compose and AndroidX, Google.")
            }

            EzberCard {
                Text(
                    text = "Provisional attributions. The authoritative license registry lives in " +
                        "licenses/ in this repository and is maintained by the rights work.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(row.title, style = MaterialTheme.typography.bodyLarge)
                Text(row.source, style = MaterialTheme.typography.bodyMedium)
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
