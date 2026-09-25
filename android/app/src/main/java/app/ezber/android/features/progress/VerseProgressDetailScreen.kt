package app.ezber.android.features.progress

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.models.Iso8601
import app.ezber.android.models.Note
import app.ezber.android.models.Surah
import app.ezber.android.models.VerseId
import app.ezber.android.models.VerseRange
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.InfoRow
import app.ezber.android.ui.ScreenScaffold
import app.ezber.android.ui.StateBadge
import app.ezber.android.ui.TransliterationText

/** A per-verse view of repetitions completed, last played, state, and notes. */
@Composable
fun VerseProgressDetailScreen(
    app: AppEnvironment,
    verseId: VerseId,
    onDrill: (Surah, VerseRange) -> Unit,
    onBack: () -> Unit,
) {
    val revision = app.dataRevision
    val surah = remember(verseId) { app.content.surah(verseId.surah) }
    val verse = remember(verseId) {
        app.content.verses(verseId.surah, VerseRange(verseId.number, verseId.number)).firstOrNull()
    }
    val progressRows = remember(revision, verseId) { app.userData.progressForVerse(verseId) }
    val notes = remember(revision, verseId) { app.userData.notesForVerse(verseId.reference) }
    var newNoteBody by remember { mutableStateOf("") }

    val repetitions = progressRows.sumOf { it.repetitionsDone }
    val lastPlayed = progressRows.mapNotNull { it.lastPlayedAt }.maxOrNull()
    val state = progressRows.maxByOrNull { it.repetitionsDone }?.state

    ScreenScaffold(title = verseId.reference, onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            EzberCard {
                if (verse != null) {
                    TransliterationText(
                        text = verse.transliteration.ifEmpty { "Transliteration not available yet." },
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    if (verse.arabic.isNotEmpty()) {
                        Text(
                            text = verse.arabic,
                            style = MaterialTheme.typography.titleMedium,
                            textAlign = TextAlign.End,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                } else {
                    Text(
                        text = "Verse text not available.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            EzberCard {
                Text("Progress", style = MaterialTheme.typography.titleMedium)
                InfoRow(title = "Repetitions completed", value = repetitions.toString())
                InfoRow(title = "Exposure count", value = progressRows.size.toString())
                InfoRow(title = "Last played", value = Iso8601.display(lastPlayed))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("State", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                    StateBadge(state)
                }
            }

            EzberCard {
                Text("Notes", style = MaterialTheme.typography.titleMedium)
                if (notes.isEmpty()) {
                    Text(
                        text = "No notes for this verse yet.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                for (note in notes) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = if (note.isVoiceMemo) {
                                    Icons.Filled.RecordVoiceOver
                                } else {
                                    Icons.Filled.EditNote
                                },
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.padding(horizontal = 4.dp))
                            Text(note.bodyMarkdown, style = MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.weight(1f))
                            IconButton(
                                onClick = {
                                    app.userData.deleteNote(note.id)
                                    app.notifyDataChanged()
                                },
                            ) {
                                Icon(Icons.Filled.Delete, contentDescription = "Delete note")
                            }
                        }
                        Text(
                            text = Iso8601.display(note.updatedAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        HorizontalDivider()
                    }
                }
                OutlinedTextField(
                    value = newNoteBody,
                    onValueChange = { newNoteBody = it },
                    label = { Text("Add a note") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(
                    onClick = {
                        val body = newNoteBody.trim()
                        if (body.isNotEmpty()) {
                            app.userData.saveNote(
                                Note(
                                    verseKey = verseId.reference,
                                    bodyMarkdown = body,
                                    createdAt = Iso8601.now(),
                                    updatedAt = Iso8601.now(),
                                ),
                            )
                            newNoteBody = ""
                            app.notifyDataChanged()
                        }
                    },
                    enabled = newNoteBody.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Save note")
                }
            }

            Button(
                onClick = { surah?.let { onDrill(it, VerseRange(verseId.number, verseId.number)) } },
                enabled = surah != null,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(Modifier.padding(horizontal = 4.dp))
                Text("Drill this verse")
            }
        }
    }
}
