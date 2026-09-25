package app.ezber.android.features.progress

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.models.MemorizationState
import app.ezber.android.models.Surah
import app.ezber.android.models.VerseId
import app.ezber.android.models.VerseRange
import app.ezber.android.models.VerseSummary
import app.ezber.android.models.summarizeByVerse
import app.ezber.android.features.presetbuilder.PresetBuilderRoute
import app.ezber.android.ui.EmptyState
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.Metric
import app.ezber.android.ui.Navigator
import app.ezber.android.ui.Screen
import app.ezber.android.ui.ScreenScaffold
import app.ezber.android.ui.StateBadge

/**
 * Honest exposure: per-surah repetition counts, per-verse states, and a gentle
 * "what to drill next".
 */
@Composable
fun ProgressOverviewScreen(app: AppEnvironment, navigator: Navigator) {
    val revision = app.dataRevision
    val summaries = remember(revision) { app.userData.allProgress().summarizeByVerse() }
    val sections = remember(summaries) {
        summaries
            .groupBy { it.verseId.surah }
            .mapNotNull { (surahId, entries) ->
                app.content.surah(surahId)?.let { surah -> surah to entries }
            }
            .sortedBy { it.first.id }
    }
    val nextUp = remember(summaries) {
        summaries.minWithOrNull(
            compareBy({ it.repetitions }, { it.verseId.surah }, { it.verseId.number }),
        )
    }

    ScreenScaffold(title = stringResource(R.string.title_progress)) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SummaryCard(summaries)

            if (nextUp != null) {
                NextUpCard(summary = nextUp) {
                    navigator.push(
                        Screen.PresetBuilder(
                            PresetBuilderRoute.New(
                                surahId = nextUp.verseId.surah,
                                range = VerseRange(nextUp.verseId.number, nextUp.verseId.number),
                            ),
                        ),
                    )
                }
            }

            if (sections.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.BarChart,
                    title = "No progress yet",
                    message = "Drill a section and your per-verse exposure will appear here.",
                )
            } else {
                for ((surah, entries) in sections) {
                    SurahProgressCard(
                        surah = surah,
                        entries = entries,
                        onVerseClick = { verseId -> navigator.push(Screen.VerseProgressDetail(verseId)) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(summaries: List<VerseSummary>) {
    val repetitions = summaries.sumOf { it.repetitions }
    val memorized = summaries.count { it.state == MemorizationState.MEMORIZED }
    val stateCounts = MemorizationState.entries.map { state ->
        state to summaries.count { it.state == state }
    }

    EzberCard {
        Text("What has been drilled", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Metric(repetitions.toString(), "repetitions")
            Metric(summaries.size.toString(), "verses touched")
            Metric(memorized.toString(), "memorized")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            for ((state, count) in stateCounts) {
                Text(
                    text = "$count ${state.label.lowercase()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun NextUpCard(summary: VerseSummary, onDrill: () -> Unit) {
    EzberCard {
        Text("What to drill next", style = MaterialTheme.typography.titleMedium)
        Text(
            text = "${summary.verseId.reference} has ${summary.repetitions} repetitions so far.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onDrill) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(Modifier.padding(horizontal = 4.dp))
            Text("Drill this verse")
        }
    }
}

@Composable
private fun SurahProgressCard(
    surah: Surah,
    entries: List<VerseSummary>,
    onVerseClick: (VerseId) -> Unit,
) {
    val totalRepetitions = entries.sumOf { it.repetitions }

    EzberCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(surah.nameLatin, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.weight(1f))
            Text(
                text = "$totalRepetitions repetitions",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        for (entry in entries) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onVerseClick(entry.verseId) }
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(entry.verseId.reference, style = MaterialTheme.typography.bodyMedium)
                StateBadge(entry.state)
                Spacer(Modifier.weight(1f))
                Text(
                    text = "${entry.repetitions}×",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(
                    imageVector = Icons.Filled.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
