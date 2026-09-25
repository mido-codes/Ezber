package app.ezber.android.features.reciterpicker

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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.models.DownloadState
import app.ezber.android.models.Reciter
import app.ezber.android.ui.LocalEzberColors
import app.ezber.android.ui.ScreenScaffold
import kotlinx.coroutines.delay

/**
 * Reciters with name, style and a short sample. Sample playback is stubbed; the
 * row shows a temporary "playing" state so the interaction reads.
 */
@Composable
fun ReciterPickerScreen(
    app: AppEnvironment,
    selectedId: Int?,
    onSelect: (Reciter) -> Unit,
    onBack: () -> Unit,
) {
    var samplingId by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(samplingId) {
        val id = samplingId ?: return@LaunchedEffect
        delay(3_000)
        if (samplingId == id) samplingId = null
    }

    ScreenScaffold(title = stringResource(R.string.title_reciters), onBack = onBack) { padding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
            items(app.content.allReciters(), key = { it.id }) { reciter ->
                ReciterRow(
                    reciter = reciter,
                    selected = reciter.id == selectedId,
                    sampling = samplingId == reciter.id,
                    downloadState = app.content.downloadState(reciter.id, surahId = 0),
                    onToggleSample = {
                        samplingId = if (samplingId == reciter.id) null else reciter.id
                    },
                    onClick = { onSelect(reciter) },
                )
                HorizontalDivider()
            }
        }
    }
}

/** Reciter chooser used inside the preset builder and settings. */
@Composable
fun ReciterPickerDialog(
    reciters: List<Reciter>,
    selectedId: Int?,
    onSelect: (Reciter) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.title_reciters)) },
        text = {
            LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                items(reciters, key = { it.id }) { reciter ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(reciter) }
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(reciter.name, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                text = reciter.subtitle,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (reciter.id == selectedId) {
                            Icon(
                                imageVector = Icons.Filled.CheckCircle,
                                contentDescription = null,
                                tint = LocalEzberColors.current.primary,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun ReciterRow(
    reciter: Reciter,
    selected: Boolean,
    sampling: Boolean,
    downloadState: DownloadState,
    onToggleSample: () -> Unit,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(reciter.name, style = MaterialTheme.typography.bodyLarge)
            Text(
                text = reciter.subtitle,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = if (downloadState == DownloadState.DOWNLOADED) {
                    "Sample downloaded"
                } else {
                    "Sample not downloaded"
                },
                style = MaterialTheme.typography.labelSmall,
                color = if (downloadState == DownloadState.DOWNLOADED) {
                    MaterialTheme.colorScheme.secondary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
        IconButton(onClick = onToggleSample) {
            Icon(
                imageVector = if (sampling) Icons.Filled.StopCircle else Icons.Filled.PlayCircle,
                contentDescription = "Play sample from ${reciter.name}",
            )
        }
        if (selected) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = LocalEzberColors.current.primary,
            )
        } else {
            Spacer(Modifier.padding(horizontal = 12.dp))
        }
    }
}
