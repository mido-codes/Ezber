package app.ezber.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import app.ezber.android.AppEnvironment
import kotlinx.coroutines.launch

/**
 * Renders [content] once the catalogue (and, when [surahId] is set, that
 * surah's verse text) is present in the content cache, and a retryable loading
 * or error state otherwise.
 *
 * The engine only fetches what is needed: the first frame pulls `index.json`,
 * opening a surah pulls that surah's file once, and anything already cached is
 * never refetched. Previews have no repository and skip straight to [content].
 */
@Composable
fun ContentGate(
    app: AppEnvironment,
    surahId: Int? = null,
    modifier: Modifier = Modifier,
    loadingMessage: String = "Loading content…",
    content: @Composable () -> Unit,
) {
    val repository = app.contentRepository
    LaunchedEffect(repository, surahId) {
        repository ?: return@LaunchedEffect
        repository.ensureIndex()
        if (surahId != null) repository.ensureSurah(surahId)
    }

    if (repository == null) {
        content()
        return
    }

    val state = repository.state
    // Reading the revision keeps this gate in step with every cache write.
    val revision = state.revision
    val ready = state.catalogReady && (surahId == null || state.isSurahCached(surahId))
    val failure = when {
        ready -> null
        surahId != null -> state.surahFailures[surahId] ?: state.lastError
        else -> state.lastError
    }
    val scope = rememberCoroutineScope()

    Box(modifier) {
        when {
            ready -> content()
            failure != null -> ContentErrorState(
                message = failure,
                onRetry = {
                    scope.launch {
                        if (surahId != null) {
                            repository.ensureSurah(surahId)
                        } else {
                            repository.ensureIndex(force = true)
                        }
                    }
                },
            )

            else -> LoadingState(loadingMessage)
        }
    }
}
