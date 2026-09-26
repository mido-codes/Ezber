package app.ezber.android.features.presetbuilder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.features.reciterpicker.ReciterPickerDialog
import app.ezber.android.models.DownloadScope
import app.ezber.android.models.PlaybackMode
import app.ezber.android.models.Preset
import app.ezber.android.models.TranslationMode
import app.ezber.android.models.TransliterationStyle
import app.ezber.android.ui.ContentGate
import app.ezber.android.ui.DropdownField
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.InfoRow
import app.ezber.android.ui.LocalEzberColors
import app.ezber.android.ui.ScreenScaffold
import kotlin.math.roundToInt

/**
 * Define a drill and save it: surah and range, per-verse repeats with
 * overrides, reciter, display options, pause and loop.
 */
@Composable
fun PresetBuilderScreen(
    app: AppEnvironment,
    route: PresetBuilderRoute,
    onSaved: (Preset) -> Unit,
    onBack: () -> Unit,
) {
    val isEditing = route is PresetBuilderRoute.Edit
    ScreenScaffold(
        title = stringResource(
            if (isEditing) R.string.title_preset_builder_edit else R.string.title_preset_builder,
        ),
        onBack = onBack,
    ) { padding ->
        ContentGate(app = app, modifier = Modifier.padding(padding)) {
            PresetBuilderForm(app = app, route = route, onSaved = onSaved)
        }
    }
}

@Composable
private fun PresetBuilderForm(
    app: AppEnvironment,
    route: PresetBuilderRoute,
    onSaved: (Preset) -> Unit,
) {
    val existingPreset = remember(route) {
        (route as? PresetBuilderRoute.Edit)?.let { app.userData.preset(it.presetId) }
    }
    var draft by remember(route) { mutableStateOf(buildDraft(app, route)) }
    var showReciterDialog by remember { mutableStateOf(false) }

    val isEditing = route is PresetBuilderRoute.Edit
    val surah = app.content.surah(draft.surahId)
    val verseCount = maxOf(1, surah?.verseCount ?: 1)

    LaunchedEffect(draft.surahId) {
        val currentSurah = app.content.surah(draft.surahId)
        if (currentSurah != null) {
            draft = draft.clamp(currentSurah.verseCount)
        }
    }

    val allSurahs = remember { app.content.allSurahs() }
    val surahOptions = remember(allSurahs) {
        allSurahs.map { item -> "${item.id}. ${item.nameLatin}" to item.id }
    }
    val verseOptions = remember(verseCount) {
        (1..verseCount).map { number -> "Verse $number" to number }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            EzberCard {
                Text("Name", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = draft.name,
                    onValueChange = { draft = draft.copy(name = it) },
                    label = { Text("Preset name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        item {
            EzberCard {
                Text("Surah and section", style = MaterialTheme.typography.titleMedium)
                DropdownField(
                    label = "Surah",
                    value = surah?.let { "${it.id}. ${it.nameLatin}" } ?: "Surah ${draft.surahId}",
                    options = surahOptions.map { (label, id) ->
                        label to {
                            draft = draft.copy(surahId = id, overrides = emptyMap())
                        }
                    },
                )
                DropdownField(
                    label = "From",
                    value = "Verse ${draft.range.start}",
                    options = verseOptions.map { (label, number) ->
                        label to {
                            draft = draft.copy(
                                range = draft.range.copy(start = number),
                            ).let { if (it.range.end < number) it.copy(range = it.range.copy(end = number)) else it }
                        }
                    },
                )
                DropdownField(
                    label = "To",
                    value = "Verse ${draft.range.end}",
                    options = verseOptions.map { (label, number) ->
                        label to {
                            draft = draft.copy(
                                range = draft.range.copy(end = number),
                            ).let { if (it.range.start > number) it.copy(range = it.range.copy(start = number)) else it }
                        }
                    },
                )
                InfoRow(title = "Section length", value = "${draft.range.count} verses")
                InfoRow(title = "Total repetitions", value = "${draft.repeats.totalRepetitions(draft.range)}")
            }
        }

        item {
            EzberCard {
                Text("Repeats", style = MaterialTheme.typography.titleMedium)
                StepperRow(
                    label = "Default repeats",
                    value = draft.defaultRepeats,
                    range = 1..50,
                    onValueChange = { draft = draft.copy(defaultRepeats = it, overrides = emptyMap()) },
                )
                if (draft.overrides.isNotEmpty()) {
                    OutlinedButton(
                        onClick = { draft = draft.copy(overrides = emptyMap()) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Reset per-verse overrides")
                    }
                }
            }
        }

        items(draft.verseNumbers, key = { it }) { number ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Verse $number")
                    if (draft.overrides.containsKey(number)) {
                        Text(
                            text = "override",
                            style = MaterialTheme.typography.labelSmall,
                            color = LocalEzberColors.current.primary,
                        )
                    }
                }
                StepperRow(
                    label = "",
                    value = draft.repeats.repeatsFor(number),
                    range = 1..99,
                    onValueChange = { draft = draft.updateRepeat(it, number) },
                )
                Text(
                    text = "${draft.repeats.repeatsFor(number)}×",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.End,
                    modifier = Modifier.width(44.dp),
                )
            }
        }

        item {
            EzberCard {
                Text("Reciter", style = MaterialTheme.typography.titleMedium)
                OutlinedButton(
                    onClick = { showReciterDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(app.content.reciter(draft.reciterId)?.name ?: "Choose a reciter")
                }
                Text(
                    text = "Audio rights: only reciters the pipeline ships stay selectable here.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            EzberCard {
                Text("Display", style = MaterialTheme.typography.titleMedium)
                SwitchRow(
                    label = "Transliteration",
                    checked = draft.showTransliteration,
                    onCheckedChange = { draft = draft.copy(showTransliteration = it) },
                )
                SwitchRow(
                    label = "Arabic script",
                    checked = draft.showArabic,
                    onCheckedChange = { draft = draft.copy(showArabic = it) },
                )
                SwitchRow(
                    label = "Translation shown",
                    checked = draft.showTranslation,
                    onCheckedChange = { draft = draft.copy(showTranslation = it) },
                )
                DropdownField(
                    label = "Translation mode",
                    value = draft.translationMode.label,
                    options = TranslationMode.entries.map { mode ->
                        mode.label to { draft = draft.copy(translationMode = mode) }
                    },
                )
                DropdownField(
                    label = "Transliteration style",
                    value = draft.transliterationStyle.label,
                    options = TransliterationStyle.entries.map { style ->
                        style.label to { draft = draft.copy(transliterationStyle = style) }
                    },
                )
                DropdownField(
                    label = "Playback",
                    value = draft.playbackMode.label,
                    options = PlaybackMode.entries.map { mode ->
                        mode.label to { draft = draft.copy(playbackMode = mode) }
                    },
                )
                DropdownField(
                    label = "Downloads",
                    value = draft.downloadScope.label,
                    options = DownloadScope.entries.map { scope ->
                        scope.label to { draft = draft.copy(downloadScope = scope) }
                    },
                )
                PauseSliderRow(
                    pauseMs = draft.pauseBetweenRepeatsMs,
                    onValueChange = { draft = draft.copy(pauseBetweenRepeatsMs = it) },
                )
                SwitchRow(
                    label = "Loop until stopped",
                    checked = draft.loopUntilStopped,
                    onCheckedChange = { draft = draft.copy(loopUntilStopped = it) },
                )
            }
        }

        item {
            Button(
                onClick = {
                    val currentSurah = surah ?: return@Button
                    val preset = draft.makePreset(existingPreset, currentSurah)
                    val id = app.userData.savePreset(preset)
                    app.userData.setLastPresetId(id)
                    app.notifyDataChanged()
                    onSaved(preset.copy(id = id))
                },
                enabled = surah != null,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (isEditing) "Save changes" else "Save preset")
            }
        }
    }

    if (showReciterDialog) {
        ReciterPickerDialog(
            reciters = app.content.allReciters(),
            selectedId = draft.reciterId,
            onSelect = { reciter ->
                draft = draft.copy(reciterId = reciter.id)
                showReciterDialog = false
            },
            onDismiss = { showReciterDialog = false },
        )
    }
}

private fun buildDraft(app: AppEnvironment, route: PresetBuilderRoute): PresetDraft = when (route) {
    is PresetBuilderRoute.New -> {
        val fallbackSurahId = route.surahId ?: app.userData.lastUsedPreset()?.surahId ?: 1
        PresetDraft.new(
            surahId = fallbackSurahId,
            range = route.range,
            settings = app.settings,
            reciters = app.content.allReciters(),
        )
    }

    is PresetBuilderRoute.Edit -> app.userData.preset(route.presetId)?.let(PresetDraft::from)
        ?: PresetDraft.new(null, null, app.settings, app.content.allReciters())
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun StepperRow(
    label: String,
    value: Int,
    range: IntRange,
    onValueChange: (Int) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (label.isNotEmpty()) {
            Text(label, modifier = Modifier.weight(1f))
        }
        IconButton(
            onClick = { onValueChange((value - 1).coerceIn(range)) },
            enabled = value > range.first,
        ) {
            Icon(Icons.Filled.Remove, contentDescription = "Decrease $label")
        }
        Text(value.toString(), style = MaterialTheme.typography.bodyLarge)
        IconButton(
            onClick = { onValueChange((value + 1).coerceIn(range)) },
            enabled = value < range.last,
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Increase $label")
        }
    }
}

@Composable
private fun PauseSliderRow(pauseMs: Int, onValueChange: (Int) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text("Pause between repeats: ${"%.1f".format(pauseMs / 1000f)}s")
        Slider(
            value = pauseMs / 1000f,
            onValueChange = { onValueChange((it * 1000).roundToInt()) },
            valueRange = 0f..5f,
            steps = 9,
        )
    }
}
