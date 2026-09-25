package app.ezber.android.features.presetlibrary

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.DriveFileRenameOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.features.presetbuilder.PresetBuilderRoute
import app.ezber.android.models.Iso8601
import app.ezber.android.models.Preset
import app.ezber.android.models.Surah
import app.ezber.android.ui.EmptyState
import app.ezber.android.ui.LocalEzberColors
import app.ezber.android.ui.Navigator
import app.ezber.android.ui.Screen
import app.ezber.android.ui.ScreenScaffold

/** Saved presets with one-tap play and rename / duplicate / edit / delete. */
@Composable
fun PresetLibraryScreen(app: AppEnvironment, navigator: Navigator) {
    val revision = app.dataRevision
    val presets = remember(revision) { app.userData.allPresets() }

    var renameTarget by remember { mutableStateOf<Preset?>(null) }
    var renameText by remember { mutableStateOf("") }
    var deleteTarget by remember { mutableStateOf<Preset?>(null) }

    ScreenScaffold(
        title = stringResource(R.string.title_preset_library),
        actions = {
            IconButton(onClick = { navigator.push(Screen.PresetBuilder(PresetBuilderRoute.New())) }) {
                Icon(Icons.Filled.Add, contentDescription = "New preset")
            }
        },
    ) { padding ->
        if (presets.isEmpty()) {
            EmptyState(
                icon = Icons.AutoMirrored.Filled.MenuBook,
                title = "No presets yet",
                message = "Build a drill from a surah and section to see it here.",
                modifier = Modifier.padding(padding),
            )
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(presets, key = { it.id }) { preset ->
                    PresetRow(
                        preset = preset,
                        surah = app.content.surah(preset.surahId ?: 0),
                        reciterName = app.content.reciter(preset.reciterId)?.name
                            ?: "No reciter",
                        onPlay = {
                            app.userData.setLastPresetId(preset.id)
                            app.notifyDataChanged()
                            navigator.push(Screen.StudyPlayer(preset.id))
                        },
                        onEdit = {
                            navigator.push(Screen.PresetBuilder(PresetBuilderRoute.Edit(preset.id)))
                        },
                        onDuplicate = {
                            val now = Iso8601.now()
                            app.userData.savePreset(
                                preset.copy(
                                    id = 0L,
                                    name = "${preset.name} copy",
                                    createdAt = now,
                                    updatedAt = now,
                                    lastUsedAt = null,
                                ),
                            )
                            app.notifyDataChanged()
                        },
                        onRename = {
                            renameTarget = preset
                            renameText = preset.name
                        },
                        onDelete = { deleteTarget = preset },
                    )
                    HorizontalDivider()
                }
            }
        }
    }

    renameTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text("Rename preset") },
            text = {
                OutlinedTextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    label = { Text("Name") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val trimmed = renameText.trim()
                        if (trimmed.isNotEmpty()) {
                            app.userData.savePreset(
                                target.copy(name = trimmed, updatedAt = Iso8601.now()),
                            )
                            app.notifyDataChanged()
                        }
                        renameTarget = null
                    },
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { renameTarget = null }) { Text("Cancel") }
            },
        )
    }

    deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Delete preset?") },
            text = {
                Text("${target.name} will be removed. Verse progress and notes are kept.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        app.userData.deletePreset(target.id)
                        app.notifyDataChanged()
                        deleteTarget = null
                    },
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun PresetRow(
    preset: Preset,
    surah: Surah?,
    reciterName: String,
    onPlay: () -> Unit,
    onEdit: () -> Unit,
    onDuplicate: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onPlay) {
            Icon(
                imageVector = Icons.Filled.PlayCircle,
                contentDescription = "Play ${preset.name}",
                tint = LocalEzberColors.current.primary,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = preset.name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = if (surah != null) {
                    "${surah.nameLatin} ${preset.range.displayString} · ${preset.range.count} verses"
                } else {
                    "Surah ${preset.surahId ?: "?"} ${preset.range.displayString}"
                },
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "$reciterName · ${preset.repeatSummary}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Box {
            IconButton(onClick = { menuOpen = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Preset actions")
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text("Edit") },
                    leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
                    onClick = {
                        menuOpen = false
                        onEdit()
                    },
                )
                DropdownMenuItem(
                    text = { Text("Duplicate") },
                    leadingIcon = { Icon(Icons.Filled.ContentCopy, contentDescription = null) },
                    onClick = {
                        menuOpen = false
                        onDuplicate()
                    },
                )
                DropdownMenuItem(
                    text = { Text("Rename") },
                    leadingIcon = {
                        Icon(Icons.Filled.DriveFileRenameOutline, contentDescription = null)
                    },
                    onClick = {
                        menuOpen = false
                        onRename()
                    },
                )
                DropdownMenuItem(
                    text = { Text("Delete") },
                    leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null) },
                    onClick = {
                        menuOpen = false
                        onDelete()
                    },
                )
            }
        }
    }
}
