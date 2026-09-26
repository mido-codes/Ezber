package app.ezber.android.ui

import androidx.annotation.StringRes
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.features.credits.CreditsScreen
import app.ezber.android.features.home.HomeScreen
import app.ezber.android.features.notes.NotesScreen
import app.ezber.android.features.presetbuilder.PresetBuilderRoute
import app.ezber.android.features.presetbuilder.PresetBuilderScreen
import app.ezber.android.features.presetlibrary.PresetLibraryScreen
import app.ezber.android.features.progress.ProgressOverviewScreen
import app.ezber.android.features.progress.VerseProgressDetailScreen
import app.ezber.android.features.reciterpicker.ReciterPickerScreen
import app.ezber.android.features.settings.SettingsScreen
import app.ezber.android.features.studyplayer.StudyPlayerScreen
import app.ezber.android.features.surahpicker.SectionPickerScreen
import app.ezber.android.features.surahpicker.SurahPickerScreen

/** The five top-level destinations. Pickers and the player push on top. */
enum class EzberTab(
    @param:StringRes val labelRes: Int,
    val icon: ImageVector,
    val initial: Screen,
) {
    HOME(R.string.tab_home, Icons.Filled.Home, Screen.Home),
    LIBRARY(R.string.tab_library, Icons.AutoMirrored.Filled.MenuBook, Screen.PresetLibrary),
    PROGRESS(R.string.tab_progress, Icons.Filled.BarChart, Screen.ProgressOverview),
    NOTES(R.string.tab_notes, Icons.Filled.EditNote, Screen.Notes),
    SETTINGS(R.string.tab_settings, Icons.Filled.Settings, Screen.Settings),
}

@Composable
fun RootView(app: AppEnvironment) {
    // The content catalogue is the app's first network request; every screen
    // reads the cache synchronously and ContentGate handles per-surah fetches.
    LaunchedEffect(app.contentRepository) {
        app.contentRepository?.ensureIndex()
    }

    var selectedTabIndex by rememberSaveable { mutableStateOf(0) }
    val navigators = remember {
        EzberTab.entries.associateWith { Navigator(it.initial) }
    }

    Scaffold(
        containerColor = LocalEzberColors.current.background,
        bottomBar = {
            NavigationBar(containerColor = LocalEzberColors.current.card) {
                EzberTab.entries.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        selected = selectedTabIndex == index,
                        onClick = { selectedTabIndex = index },
                        icon = { Icon(tab.icon, contentDescription = null) },
                        label = { Text(stringResource(tab.labelRes)) },
                    )
                }
            }
        },
    ) { innerPadding ->
        val navigator = navigators.getValue(EzberTab.entries[selectedTabIndex])
        BackHandler(enabled = navigator.canPop) { navigator.pop() }
        ScreenHost(
            screen = navigator.current,
            navigator = navigator,
            app = app,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@Composable
private fun ScreenHost(
    screen: Screen,
    navigator: Navigator,
    app: AppEnvironment,
    modifier: Modifier = Modifier,
) {
    // `screen` is read from the navigator's state list inside RootView, so this
    // keyed switch re-runs whenever the top of the stack changes.
    key(screen) {
        Box(modifier) {
            when (screen) {
                Screen.Home -> HomeScreen(app = app, navigator = navigator)

                Screen.SurahPicker -> SurahPickerScreen(
                    app = app,
                    onSelect = { surah -> navigator.push(Screen.SectionPicker(surah.id)) },
                    onBack = navigator::pop,
                )

                is Screen.SectionPicker -> SectionPickerScreen(
                    app = app,
                    surahId = screen.surahId,
                    onContinue = { surah, range ->
                        navigator.push(Screen.PresetBuilder(PresetBuilderRoute.New(surah.id, range)))
                    },
                    onBack = navigator::pop,
                )

                is Screen.PresetBuilder -> PresetBuilderScreen(
                    app = app,
                    route = screen.route,
                    onSaved = { preset -> navigator.replaceTop(Screen.StudyPlayer(preset.id)) },
                    onBack = navigator::pop,
                )

                is Screen.StudyPlayer -> StudyPlayerScreen(
                    app = app,
                    presetId = screen.presetId,
                    onBack = navigator::pop,
                )

                Screen.ReciterPicker -> ReciterPickerScreen(
                    app = app,
                    selectedId = app.settings.defaultReciterId,
                    onSelect = { reciter ->
                        app.settings.updateDefaultReciter(reciter.id)
                        navigator.pop()
                    },
                    onBack = navigator::pop,
                )

                is Screen.VerseProgressDetail -> VerseProgressDetailScreen(
                    app = app,
                    verseId = screen.verseId,
                    onDrill = { surah, range ->
                        navigator.push(Screen.PresetBuilder(PresetBuilderRoute.New(surah.id, range)))
                    },
                    onBack = navigator::pop,
                )

                Screen.PresetLibrary -> PresetLibraryScreen(app = app, navigator = navigator)

                Screen.ProgressOverview -> ProgressOverviewScreen(app = app, navigator = navigator)

                Screen.Notes -> NotesScreen(app = app)

                Screen.Settings -> SettingsScreen(
                    app = app,
                    onOpenCredits = { navigator.push(Screen.Credits) },
                )

                Screen.Credits -> CreditsScreen(
                    app = app,
                    onBack = navigator::pop,
                )
            }
        }
    }
}
