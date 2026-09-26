package app.ezber.android.features.surahpicker

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.models.Surah
import app.ezber.android.models.VerseRange
import app.ezber.android.ui.ContentGate
import app.ezber.android.ui.DropdownField
import app.ezber.android.ui.EmptyState
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.InfoRow
import app.ezber.android.ui.ScreenScaffold
import app.ezber.android.ui.SurahRowItem
import app.ezber.android.ui.TransliterationText

/**
 * Pick the verse range for a drill. The default is a short section of five
 * verses; "Full surah" is one tap away. The preview line below comes from the
 * surah's cached content file, so opening this screen also warms that cache.
 */
@Composable
fun SectionPickerScreen(
    app: AppEnvironment,
    surahId: Int,
    onContinue: (Surah, VerseRange) -> Unit,
    onBack: () -> Unit,
) {
    ScreenScaffold(title = stringResource(R.string.title_section_picker), onBack = onBack) { padding ->
        ContentGate(
            app = app,
            surahId = surahId,
            modifier = Modifier.padding(padding),
            loadingMessage = "Loading ${app.content.surah(surahId)?.nameLatin ?: "surah"}…",
        ) {
            SectionPickerContent(app = app, surahId = surahId, onContinue = onContinue)
        }
    }
}

@Composable
private fun SectionPickerContent(
    app: AppEnvironment,
    surahId: Int,
    onContinue: (Surah, VerseRange) -> Unit,
) {
    val surah = remember(surahId) { app.content.surah(surahId) }
    val verseCount = maxOf(1, surah?.verseCount ?: 1)
    var start by rememberSaveable(surahId) { mutableStateOf(1) }
    var end by rememberSaveable(surahId) { mutableStateOf(minOf(5, verseCount)) }

    val verseOptions = remember(verseCount) {
        (1..verseCount).map { number -> "Verse $number" to number }
    }
    val previewVerse = remember(surahId, start) {
        app.content.verses(surahId, VerseRange(start, start)).firstOrNull()
    }

    if (surah == null) {
        EmptyState(
            icon = Icons.Filled.Warning,
            title = "Surah unavailable",
            message = "This surah is not in the content catalogue.",
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        EzberCard {
            SurahRowItem(surah = surah)
        }

        EzberCard {
            Text("Range", style = MaterialTheme.typography.titleMedium)
            DropdownField(
                label = "From",
                value = "Verse $start",
                options = verseOptions.map { (label, number) ->
                    label to {
                        start = number
                        if (end < start) end = start
                    }
                },
            )
            DropdownField(
                label = "To",
                value = "Verse $end",
                options = verseOptions.map { (label, number) ->
                    label to {
                        end = number
                        if (start > end) start = end
                    }
                },
            )
            OutlinedButton(
                onClick = {
                    start = 1
                    end = minOf(5, verseCount)
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("First 5 verses")
            }
            OutlinedButton(
                onClick = {
                    start = 1
                    end = verseCount
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Full surah")
            }
            InfoRow(title = "Section length", value = "${maxOf(0, end - start + 1)} verses")
        }

        EzberCard {
            Text("Preview", style = MaterialTheme.typography.titleMedium)
            if (previewVerse != null) {
                TransliterationText(
                    text = previewVerse.transliteration.ifEmpty {
                        "Transliteration not available for this verse."
                    },
                )
                if (app.settings.defaultShowArabic && previewVerse.arabic.isNotEmpty()) {
                    Text(
                        text = previewVerse.arabic,
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                Text(
                    text = previewVerse.reference,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        TextButton(
            onClick = { onContinue(surah, VerseRange(start, end)) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Continue to repeats")
        }
    }
}
