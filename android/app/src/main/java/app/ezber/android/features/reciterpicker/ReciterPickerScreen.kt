package app.ezber.android.features.reciterpicker

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.models.DownloadState
import app.ezber.android.models.Reciter
import app.ezber.android.ui.ContentGate
import app.ezber.android.ui.DownloadStateBadge
import app.ezber.android.ui.LocalEzberColors
import app.ezber.android.ui.ScreenScaffold

/**
 * The reciter catalogue from the content bundle: name, style, qirat, license
 * and rights state. Reciters the pipeline marks `enabled = 0` are shown as
 * rights-pending rather than hidden.
 */
@Composable
fun ReciterPickerScreen(
    app: AppEnvironment,
    selectedId: Int?,
    onSelect: (Reciter) -> Unit,
    onBack: () -> Unit,
) {
    // The audio catalogue is a whole-bundle file; fetch it once so download
    // state is honest instead of defaulting every row to "not downloaded".
    LaunchedEffect(app.contentRepository) {
        app.contentRepository?.ensureAudioFiles()
    }

    ScreenScaffold(title = stringResource(R.string.title_reciters), onBack = onBack) { padding ->
        ContentGate(
            app = app,
            modifier = Modifier.padding(padding),
            loadingMessage = "Loading reciters…",
        ) {
            ReciterList(
                app = app,
                selectedId = selectedId,
                onSelect = onSelect,
            )
        }
    }
}

@Composable
private fun ReciterList(
    app: AppEnvironment,
    selectedId: Int?,
    onSelect: (Reciter) -> Unit,
) {
    val revision = app.contentRepository?.state?.revision ?: 0
    val reciters = remember(revision) { app.content.allReciters() }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(reciters, key = { it.id }) { reciter ->
            ReciterRow(
                reciter = reciter,
                selected = reciter.id == selectedId,
                downloadState = app.content.downloadState(reciter.id, surahId = 0),
                onClick = { onSelect(reciter) },
            )
            HorizontalDivider()
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
                            if (!reciter.enabled) {
                                Text(
                                    text = "Rights pending · not playable",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
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
    downloadState: DownloadState,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(reciter.name, style = MaterialTheme.typography.bodyLarge)
            if (reciter.subtitle.isNotEmpty()) {
                Text(
                    text = reciter.subtitle,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (reciter.attribution.isNotEmpty()) {
                Text(
                    text = reciter.attribution,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DownloadStateBadge(downloadState)
                if (reciter.hasSegments) {
                    Text(
                        text = "Word timings",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
                if (!reciter.enabled) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Filled.Gavel,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Text(
                            text = " Rights pending · not playable",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
        if (selected) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = "Selected",
                tint = LocalEzberColors.current.primary,
            )
        }
    }
}
