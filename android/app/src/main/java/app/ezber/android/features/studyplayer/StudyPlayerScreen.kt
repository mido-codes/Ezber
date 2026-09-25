package app.ezber.android.features.studyplayer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.models.DrillQueue
import app.ezber.android.models.TranslationMode
import app.ezber.android.ui.ContentGate
import app.ezber.android.ui.EmptyState
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.LocalEzberColors
import app.ezber.android.ui.ScreenScaffold
import app.ezber.android.ui.TransliterationText

/**
 * The heart of the app while a drill runs: the current verse in transliteration
 * (Arabic optional), the repeat counter, and simple transport.
 */
@Composable
fun StudyPlayerScreen(
    app: AppEnvironment,
    presetId: Long,
    onBack: () -> Unit,
) {
    val preset = remember(presetId) { app.userData.preset(presetId) }
    val surahId = preset?.surahId

    if (preset == null || surahId == null) {
        ScreenScaffold(title = stringResource(R.string.title_study_player), onBack = onBack) { padding ->
            EmptyState(
                icon = Icons.Filled.Warning,
                title = "Preset unavailable",
                message = "This preset could not be loaded from the user store.",
                modifier = Modifier.padding(padding),
            )
        }
        return
    }

    ScreenScaffold(title = preset.name, onBack = onBack) { padding ->
        ContentGate(
            app = app,
            surahId = surahId,
            modifier = Modifier.padding(padding),
            loadingMessage = "Loading ${app.content.surah(surahId)?.nameLatin ?: "the surah"}…",
        ) {
            StudyPlayerBody(app = app, presetId = presetId, onBack = onBack)
        }
    }
}

@Composable
private fun StudyPlayerBody(app: AppEnvironment, presetId: Long, onBack: () -> Unit) {
    val preset = remember(presetId) { app.userData.preset(presetId) } ?: return
    val surah = remember(preset.surahId) {
        preset.surahId?.let { app.content.surah(it) }
    }
    val queue = remember(preset.id, surah) {
        val current = surah ?: return@remember null
        DrillQueue.build(
            preset = preset,
            surah = current,
            verses = app.content.verses(current.id, preset.range),
        )
    }

    if (surah == null || queue == null || queue.isEmpty) {
        EmptyState(
            icon = Icons.Filled.Warning,
            title = "No verses available",
            message = "The cached surah file has no verses in this preset's range. " +
                "Check Settings → Content and refresh.",
            modifier = Modifier.fillMaxSize(),
        )
        return
    }

    val model = remember(preset.id, queue) {
        StudyPlayerModel(preset, surah, queue, app)
    }
    var showNoteComposer by remember { mutableStateOf(false) }
    DisposableEffect(model) {
        onDispose { model.teardown() }
    }

    StudyPlayerContent(
        model = model,
        showNoteComposer = showNoteComposer,
        onOpenNote = { showNoteComposer = true },
        onDismissNote = { showNoteComposer = false },
    )
}

@Composable
private fun StudyPlayerContent(
    model: StudyPlayerModel,
    showNoteComposer: Boolean,
    onOpenNote: () -> Unit,
    onDismissNote: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            PositionHeader(model, onOpenNote = onOpenNote)
            VerseCard(model)
            QueueCard(model)
        }
        TransportBar(model)
    }

    if (showNoteComposer) {
        NoteComposerDialog(model = model, onDismiss = onDismissNote)
    }
}

@Composable
private fun PositionHeader(model: StudyPlayerModel, onOpenNote: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = "Verse ${model.positionInSection} of ${model.sectionCount}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.weight(1f))
        TextButton(onClick = onOpenNote) {
            Icon(Icons.Filled.EditNote, contentDescription = null)
            Spacer(Modifier.size(4.dp))
            Text("Note")
        }
    }
    Text(
        text = "${model.surah.nameLatin} ${model.currentVerse?.reference ?: ""}",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun VerseCard(model: StudyPlayerModel) {
    val verse = model.currentVerse
    EzberCard {
        if (model.preset.display.showArabic && !verse?.arabic.isNullOrEmpty()) {
            Text(
                text = verse?.arabic.orEmpty(),
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        if (model.preset.display.showTransliteration && !verse?.transliteration.isNullOrEmpty()) {
            TransliterationText(text = verse?.transliteration.orEmpty())
        }

        TranslationBlock(model)

        HorizontalDivider()

        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Repeat, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text(
                text = "Repeat ${model.state.currentRepeat} of ${model.state.repeatCount}",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.weight(1f))
            if (model.isCompleted) {
                Text(
                    text = "Completed",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF3F8F5A),
                )
            }
        }
    }
}

@Composable
private fun TranslationBlock(model: StudyPlayerModel) {
    val translation = model.currentTranslation ?: return
    if (model.shouldShowTranslation) {
        Text(translation.text, style = MaterialTheme.typography.bodyMedium)
        Text(
            text = translation.translator,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    } else if (model.preset.display.translationMode == TranslationMode.TAP_TO_REVEAL) {
        TextButton(onClick = { model.toggleTranslation() }) {
            Text("Reveal translation")
        }
    } else if (model.preset.display.translationMode == TranslationMode.HIDDEN_DURING_PLAYBACK &&
        model.isPlaying
    ) {
        Text(
            text = "Translation hidden while playing",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun QueueCard(model: StudyPlayerModel) {
    EzberCard {
        Text("Drill queue", style = MaterialTheme.typography.titleMedium)
        LinearProgressIndicator(
            progress = { model.state.progress },
            modifier = Modifier.fillMaxWidth(),
        )
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Item ${minOf(model.state.currentIndex + 1, maxOf(1, model.state.totalItemCount))} " +
                    "of ${model.state.totalItemCount}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "${model.state.completedItemCount} completed",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(model.queue.verseNumbers, key = { it }) { number ->
                val isCurrent = number == model.currentVerse?.number
                Text(
                    text = number.toString(),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isCurrent) Color.White else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier
                        .background(
                            color = if (isCurrent) {
                                LocalEzberColors.current.accent
                            } else {
                                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f)
                            },
                            shape = RoundedCornerShape(50),
                        )
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun TransportBar(model: StudyPlayerModel) {
    Surface(color = LocalEzberColors.current.card) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TransportButton(Icons.Filled.SkipPrevious, "Previous verse") {
                    model.previousVerse()
                }
                TransportButton(Icons.Filled.FastRewind, "Previous repeat") {
                    model.previousRepeat()
                }
                IconButton(onClick = { model.togglePlayPause() }) {
                    Icon(
                        imageVector = if (model.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (model.isPlaying) "Pause" else "Play",
                        tint = LocalEzberColors.current.primary,
                        modifier = Modifier.size(52.dp),
                    )
                }
                TransportButton(Icons.Filled.FastForward, "Next repeat") {
                    model.nextRepeat()
                }
                TransportButton(Icons.Filled.SkipNext, "Next verse") {
                    model.nextVerse()
                }
            }
            Text(
                text = model.reciterName,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TransportButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Icon(icon, contentDescription = label)
    }
}

@Composable
private fun NoteComposerDialog(model: StudyPlayerModel, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add note") },
        text = {
            Column {
                Text(
                    text = "Note for ${model.currentVerse?.reference ?: ""}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = model.noteDraft,
                    onValueChange = { model.noteDraft = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    model.saveNote()
                    onDismiss()
                },
                enabled = model.noteDraft.isNotBlank(),
            ) {
                Text("Save note")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
