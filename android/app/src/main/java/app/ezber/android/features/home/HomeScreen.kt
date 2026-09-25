package app.ezber.android.features.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.models.DrillQueue
import app.ezber.android.models.MemorizationState
import app.ezber.android.models.PlanState
import app.ezber.android.models.Preset
import app.ezber.android.models.Surah
import app.ezber.android.models.VerseProgress
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.Metric
import app.ezber.android.ui.Navigator
import app.ezber.android.ui.Screen
import app.ezber.android.ui.ScreenScaffold

/**
 * The most important screen: last-used preset with a large Continue control,
 * where the listener is in the section, a quick start, and a progress glance.
 */
@Composable
fun HomeScreen(app: AppEnvironment, navigator: Navigator) {
    val revision = app.dataRevision
    val contentRevision = app.contentRepository?.state?.revision ?: 0
    val lastPreset = remember(revision) { app.userData.lastUsedPreset() }
    val progress = remember(revision) { app.userData.allProgress() }
    val planState = remember(revision, lastPreset?.id) {
        lastPreset?.let { app.userData.planState(it.id) }
    }
    val surah = remember(revision, contentRevision, lastPreset?.id) {
        lastPreset?.surahId?.let { app.content.surah(it) }
    }

    // Warm the last preset's surah file so the Continue card can show where the
    // listener stopped. The catalogue is fetched by RootView on start.
    LaunchedEffect(lastPreset?.surahId) {
        lastPreset?.surahId?.let { app.contentRepository?.ensureSurah(it) }
    }

    val queue = remember(revision, contentRevision, lastPreset?.id) {
        val preset = lastPreset
        val currentSurah = surah
        if (preset != null && currentSurah != null && preset.surahId != null) {
            DrillQueue.build(
                preset = preset,
                surah = currentSurah,
                verses = app.content.verses(preset.surahId, preset.range),
            )
        } else {
            null
        }
    }

    ScreenScaffold(title = "Ezber") { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (lastPreset != null && surah != null) {
                ContinueCard(
                    preset = lastPreset,
                    surah = surah,
                    planState = planState,
                    queue = queue,
                    onContinue = {
                        app.userData.setLastPresetId(lastPreset.id)
                        app.notifyDataChanged()
                        navigator.push(Screen.StudyPlayer(lastPreset.id))
                    },
                )
            } else if (lastPreset != null) {
                PreparingCard(
                    preset = lastPreset,
                    error = app.contentRepository?.state?.surahFailures?.get(lastPreset.surahId ?: -1),
                    onContinue = { navigator.push(Screen.StudyPlayer(lastPreset.id)) },
                )
            } else {
                WelcomeCard(onStart = { navigator.push(Screen.SurahPicker) })
            }

            QuickActions(
                onNewDrill = { navigator.push(Screen.SurahPicker) },
                onReciters = { navigator.push(Screen.ReciterPicker) },
            )

            ProgressGlance(progress)
        }
    }
}

@Composable
private fun ContinueCard(
    preset: Preset,
    surah: Surah,
    planState: PlanState?,
    queue: DrillQueue?,
    onContinue: () -> Unit,
) {
    val currentItem = planState?.let { queue?.items?.getOrNull(it.planIndex) }
    val positionInSection = currentItem
        ?.let { maxOf(1, it.verse.number - preset.range.start + 1) }
        ?: 1
    val repeatIndex = currentItem?.repeatIndex ?: 1
    val repeatCount = currentItem?.repeatCount ?: preset.repeats.repeatsFor(preset.range.start)
    val progressFraction = queue?.let {
        if (it.count == 0) 0f else ((planState?.planIndex ?: 0).toFloat() / it.count).coerceIn(0f, 1f)
    } ?: 0f

    EzberCard {
        Text(
            text = "Continue",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = preset.name,
            style = MaterialTheme.typography.headlineSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = "${surah.nameLatin} ${preset.range.displayString}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Verse $positionInSection of ${preset.range.count} · Repeat $repeatIndex of $repeatCount",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LinearProgressIndicator(
            progress = { progressFraction },
            modifier = Modifier.fillMaxWidth(),
        )
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Continue drill")
        }
    }
}

@Composable
private fun PreparingCard(preset: Preset, error: String?, onContinue: () -> Unit) {
    EzberCard {
        Text(
            text = "Continue",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = preset.name,
            style = MaterialTheme.typography.headlineSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = error ?: "Fetching this preset's surah…",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Open drill")
        }
    }
}

@Composable
private fun WelcomeCard(onStart: () -> Unit) {
    EzberCard {
        Text(
            text = "Welcome",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text("Start a drill", style = MaterialTheme.typography.headlineSmall)
        Text(
            text = "Choose a surah and a short section, set your repeats, and listen verse by verse.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onStart, modifier = Modifier.fillMaxWidth()) {
            Text("Choose a surah")
        }
    }
}

@Composable
private fun QuickActions(onNewDrill: () -> Unit, onReciters: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        QuickActionButton(
            title = "New drill",
            icon = Icons.Filled.Add,
            modifier = Modifier.weight(1f),
            onClick = onNewDrill,
        )
        QuickActionButton(
            title = "Reciters",
            icon = Icons.Filled.RecordVoiceOver,
            modifier = Modifier.weight(1f),
            onClick = onReciters,
        )
    }
}

@Composable
private fun QuickActionButton(
    title: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    EzberCard(modifier = modifier.clickable(onClick = onClick)) {
        Icon(icon, contentDescription = null)
        Text(title, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ProgressGlance(progress: List<VerseProgress>) {
    val repetitions = progress.sumOf { it.repetitionsDone }
    val memorized = progress.count { it.state == MemorizationState.MEMORIZED }

    EzberCard {
        Text("Progress glance", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Metric(repetitions.toString(), "repetitions")
            Metric(progress.size.toString(), "verses touched")
            Metric(memorized.toString(), "memorized")
        }
    }
}
