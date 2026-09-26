package app.ezber.android.features.surahpicker

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.ezber.android.AppEnvironment
import app.ezber.android.R
import app.ezber.android.models.Surah
import app.ezber.android.ui.ContentGate
import app.ezber.android.ui.ScreenScaffold
import app.ezber.android.ui.SurahRowItem

/**
 * Browse the 114 surahs with Arabic, Latin and English names, verse count and
 * revelation place. Selecting one moves on to the section range.
 */
@Composable
fun SurahPickerScreen(
    app: AppEnvironment,
    onSelect: (Surah) -> Unit,
    onBack: () -> Unit,
) {
    ScreenScaffold(title = stringResource(R.string.title_surah_picker), onBack = onBack) { padding ->
        ContentGate(
            app = app,
            modifier = Modifier.padding(padding),
            loadingMessage = "Loading the surah list…",
        ) {
            SurahPickerContent(app = app, onSelect = onSelect)
        }
    }
}

@Composable
private fun SurahPickerContent(app: AppEnvironment, onSelect: (Surah) -> Unit) {
    val contentRevision = app.contentRepository?.state?.revision ?: 0
    var searchText by rememberSaveable { mutableStateOf("") }
    val surahs = remember(searchText, contentRevision) {
        val all = app.content.allSurahs()
        val query = searchText.trim().lowercase()
        if (query.isEmpty()) {
            all
        } else {
            all.filter { surah ->
                surah.nameLatin.lowercase().contains(query) ||
                    surah.nameEnglish.lowercase().contains(query) ||
                    surah.nameArabic.contains(query) ||
                    surah.id.toString() == query
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = searchText,
            onValueChange = { searchText = it },
            label = { Text("Search surahs") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(surahs, key = { it.id }) { surah ->
                SurahRowItem(
                    surah = surah,
                    onClick = { onSelect(surah) },
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                HorizontalDivider()
            }
        }
    }
}
