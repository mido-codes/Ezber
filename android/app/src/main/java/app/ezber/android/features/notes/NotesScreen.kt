package app.ezber.android.features.notes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.models.Iso8601
import app.ezber.android.models.Note
import app.ezber.android.models.VerseId
import app.ezber.android.ui.DropdownField
import app.ezber.android.ui.EmptyState
import app.ezber.android.ui.ScreenScaffold

/**
 * Verse-level notes, searchable. Voice memos are stored as notes whose body
 * records the pending transcript (the shared notes table has no memo columns),
 * matching the stub voice-memo service.
 */
@Composable
fun NotesScreen(app: AppEnvironment) {
    val revision = app.dataRevision
    var searchText by rememberSaveable { mutableStateOf("") }
    val notes = remember(revision, searchText) {
        if (searchText.isBlank()) {
            app.userData.allNotes()
        } else {
            app.userData.searchNotes(searchText)
        }
    }

    var editorOpen by remember { mutableStateOf(false) }
    var editingNote by remember { mutableStateOf<Note?>(null) }

    ScreenScaffold(
        title = stringResource(R.string.title_notes),
        actions = {
            IconButton(
                onClick = {
                    editingNote = null
                    editorOpen = true
                },
            ) {
                Icon(Icons.Filled.Add, contentDescription = "New note")
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(
                value = searchText,
                onValueChange = { searchText = it },
                label = { Text("Search notes") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )

            if (notes.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.EditNote,
                    title = "No notes",
                    message = if (searchText.isBlank()) {
                        "Notes you add while drilling will appear here."
                    } else {
                        "No notes match your search."
                    },
                )
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(notes, key = { it.id }) { note ->
                        NoteRow(
                            note = note,
                            surahName = app.content.surah(note.verseId.surah)?.nameLatin,
                            onClick = {
                                editingNote = note
                                editorOpen = true
                            },
                            onDelete = {
                                app.userData.deleteNote(note.id)
                                app.notifyDataChanged()
                            },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    if (editorOpen) {
        NoteEditorDialog(
            app = app,
            existing = editingNote,
            onDismiss = { editorOpen = false },
            onSaved = {
                editorOpen = false
                app.notifyDataChanged()
            },
            onDeleted = {
                editorOpen = false
                app.notifyDataChanged()
            },
        )
    }
}

@Composable
private fun NoteRow(
    note: Note,
    surahName: String?,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = if (note.isVoiceMemo) {
                Icons.Filled.RecordVoiceOver
            } else {
                Icons.Filled.EditNote
            },
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )
        Column(modifier = Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(note.verseId.reference, style = MaterialTheme.typography.labelMedium)
                if (surahName != null) {
                    Text(
                        text = surahName,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Text(
                text = note.bodyMarkdown,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = Iso8601.display(note.updatedAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onDelete) {
            Icon(Icons.Filled.Delete, contentDescription = "Delete note")
        }
    }
}

@Composable
private fun NoteEditorDialog(
    app: AppEnvironment,
    existing: Note?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
    onDeleted: () -> Unit,
) {
    var body by remember { mutableStateOf(existing?.bodyMarkdown.orEmpty()) }
    var surahId by remember { mutableIntStateOf(existing?.verseId?.surah ?: 1) }
    var verseNumber by remember { mutableIntStateOf(existing?.verseId?.number ?: 1) }

    val surah = app.content.surah(surahId)
    val verseCount = maxOf(1, surah?.verseCount ?: 1)
    val allSurahs = remember { app.content.allSurahs() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "New note" else "Edit note") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 460.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (existing == null) {
                    DropdownField(
                        label = "Surah",
                        value = "${surahId}. ${surah?.nameLatin ?: ""}",
                        options = allSurahs.map { item ->
                            "${item.id}. ${item.nameLatin}" to {
                                surahId = item.id
                                verseNumber = 1
                            }
                        },
                    )
                    DropdownField(
                        label = "Verse",
                        value = verseNumber.toString(),
                        options = (1..verseCount).map { number ->
                            number.toString() to { verseNumber = number }
                        },
                    )
                } else {
                    Text(
                        text = "Verse ${existing.verseKey}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it },
                    label = { Text("Note") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp),
                )

                OutlinedButton(
                    onClick = {
                        app.voiceMemo.startRecording()
                        val memo = app.voiceMemo.stopRecording()
                        val memoPath = memo?.filePath ?: "no-file"
                        body = if (body.isBlank()) {
                            "${Note.VOICE_MEMO_PREFIX} · $memoPath"
                        } else {
                            "$body\n\n${Note.VOICE_MEMO_PREFIX} · $memoPath"
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Filled.RecordVoiceOver, contentDescription = null)
                    Text(" Record voice memo (stub)")
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val trimmed = body.trim()
                    if (trimmed.isNotEmpty()) {
                        val verseKey = VerseId(surahId, verseNumber).reference
                        app.userData.saveNote(
                            Note(
                                id = existing?.id ?: 0L,
                                verseKey = verseKey,
                                bodyMarkdown = trimmed,
                                createdAt = existing?.createdAt ?: Iso8601.now(),
                                updatedAt = Iso8601.now(),
                            ),
                        )
                        onSaved()
                    }
                },
                enabled = body.isNotBlank(),
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (existing != null) {
                    TextButton(
                        onClick = {
                            app.userData.deleteNote(existing.id)
                            onDeleted()
                        },
                    ) {
                        Text("Delete")
                    }
                }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}
