package app.ezber.android.ui

import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateListOf
import app.ezber.android.features.presetbuilder.PresetBuilderRoute
import app.ezber.android.models.VerseId

/**
 * One top-level destination per tab, plus the screens pushed on top of each
 * tab's stack. Modelled after the iOS scaffold's `NavigationStack` paths: each
 * tab keeps its own stack, so switching tabs does not lose a drill in progress.
 */
sealed interface Screen {
    data object Home : Screen
    data object PresetLibrary : Screen
    data object ProgressOverview : Screen
    data object Notes : Screen
    data object Settings : Screen
    data object Credits : Screen

    data object SurahPicker : Screen
    data class SectionPicker(val surahId: Int) : Screen
    data class PresetBuilder(val route: PresetBuilderRoute) : Screen
    data class StudyPlayer(val presetId: Long) : Screen
    data object ReciterPicker : Screen
    data class VerseProgressDetail(val verseId: VerseId) : Screen
}

/** A tiny per-tab back stack. */
@Stable
class Navigator(initial: Screen) {

    private val stack = mutableStateListOf(initial)

    val current: Screen get() = stack.last()

    val canPop: Boolean get() = stack.size > 1

    fun push(screen: Screen) {
        stack.add(screen)
    }

    fun pop() {
        if (canPop) stack.removeAt(stack.lastIndex)
    }

    /** Replace the top screen; used after creating a preset to open the player. */
    fun replaceTop(screen: Screen) {
        pop()
        push(screen)
    }
}
