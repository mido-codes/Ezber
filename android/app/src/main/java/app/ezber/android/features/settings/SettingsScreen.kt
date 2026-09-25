package app.ezber.android.features.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.AppLanguage
import app.ezber.android.AppThemeMode
import app.ezber.android.CallBehavior
import app.ezber.android.NavigationBehavior
import app.ezber.android.R
import app.ezber.android.features.reciterpicker.ReciterPickerDialog
import app.ezber.android.models.TranslationMode
import app.ezber.android.models.TransliterationStyle
import app.ezber.android.ui.DropdownField
import app.ezber.android.ui.EzberCard
import app.ezber.android.ui.InfoRow
import app.ezber.android.ui.ScreenScaffold
import kotlin.math.roundToInt

/**
 * Display, audio, language, storage and about. Defaults here feed new presets;
 * the language picker switches the interface locale in MainActivity.
 */
@Composable
fun SettingsScreen(app: AppEnvironment, onOpenCredits: () -> Unit) {
    val revision = app.dataRevision
    var showReciterDialog by remember { mutableStateOf(false) }
    val settings = app.settings

    ScreenScaffold(title = stringResource(R.string.title_settings)) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            EzberCard {
                Text("Display", style = MaterialTheme.typography.titleMedium)
                DropdownField(
                    label = "Theme",
                    value = settings.themeMode.label,
                    options = AppThemeMode.entries.map { mode ->
                        mode.label to { settings.updateThemeMode(mode) }
                    },
                )
                SwitchRow(
                    label = "Arabic script by default",
                    checked = settings.defaultShowArabic,
                    onCheckedChange = settings::updateDefaultShowArabic,
                )
                DropdownField(
                    label = "Transliteration style",
                    value = settings.defaultTransliterationStyle.label,
                    options = TransliterationStyle.entries.map { style ->
                        style.label to { settings.updateDefaultTransliterationStyle(style) }
                    },
                )
                DropdownField(
                    label = "Translation",
                    value = settings.defaultTranslationMode.label,
                    options = TranslationMode.entries.map { mode ->
                        mode.label to { settings.updateDefaultTranslationMode(mode) }
                    },
                )
            }

            EzberCard {
                Text("Audio", style = MaterialTheme.typography.titleMedium)
                OutlinedButton(
                    onClick = { showReciterDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        app.content.reciter(settings.defaultReciterId)?.name
                            ?: "Choose a default reciter",
                    )
                }
                DropdownField(
                    label = "Navigation prompts",
                    value = settings.navigationBehavior.label,
                    options = NavigationBehavior.entries.map { behavior ->
                        behavior.label to { settings.updateNavigationBehavior(behavior) }
                    },
                )
                DropdownField(
                    label = "Phone calls",
                    value = settings.callBehavior.label,
                    options = CallBehavior.entries.map { behavior ->
                        behavior.label to { settings.updateCallBehavior(behavior) }
                    },
                )
                SwitchRow(
                    label = "Loop until stopped by default",
                    checked = settings.defaultLoopUntilStopped,
                    onCheckedChange = settings::updateDefaultLoopUntilStopped,
                )
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "Pause between repeats: " +
                            "${"%.1f".format(settings.defaultPauseBetweenRepeatsMs / 1000f)}s",
                    )
                    Slider(
                        value = settings.defaultPauseBetweenRepeatsMs / 1000f,
                        onValueChange = {
                            settings.updateDefaultPauseBetweenRepeatsMs((it * 1000).roundToInt())
                        },
                        valueRange = 0f..5f,
                        steps = 9,
                    )
                }
            }

            EzberCard {
                Text("Language", style = MaterialTheme.typography.titleMedium)
                DropdownField(
                    label = "Interface language",
                    value = settings.language.label,
                    options = AppLanguage.entries.map { language ->
                        language.label to { settings.updateLanguage(language) }
                    },
                )
            }

            EzberCard {
                Text("Storage and downloads", style = MaterialTheme.typography.titleMedium)
                Text(
                    text = "No downloads yet. Downloaded surahs will be listed here.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                InfoRow(title = "Content store", value = app.contentStoreDescription)
                InfoRow(title = "User store", value = app.userStoreDescription)
                OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Text("Export user data (stub)")
                }
            }

            EzberCard {
                Text("About", style = MaterialTheme.typography.titleMedium)
                InfoRow(title = "Version", value = "0.1.0 (1)")
                OutlinedButton(onClick = onOpenCredits, modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Credits and licenses", modifier = Modifier.weight(1f))
                        Icon(Icons.Filled.ChevronRight, contentDescription = null)
                    }
                }
                InfoRow(title = "Content", value = "Placeholder data")
            }
        }
    }

    if (showReciterDialog) {
        ReciterPickerDialog(
            reciters = app.content.allReciters(),
            selectedId = settings.defaultReciterId,
            onSelect = { reciter ->
                settings.updateDefaultReciter(reciter.id)
                showReciterDialog = false
            },
            onDismiss = { showReciterDialog = false },
        )
    }
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
