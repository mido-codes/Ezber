package app.ezber.android

import android.Manifest
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import app.ezber.android.ui.EzberTheme
import app.ezber.android.ui.RootView
import java.util.Locale

class MainActivity : ComponentActivity() {

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val environment = (application as EzberApplication).environment
        requestNotificationPermissionIfNeeded()

        setContent {
            val darkTheme = when (environment.settings.themeMode) {
                AppThemeMode.SYSTEM -> isSystemInDarkTheme()
                AppThemeMode.LIGHT -> false
                AppThemeMode.DARK -> true
            }
            EzberTheme(darkTheme = darkTheme) {
                // Apply the interface language to string resources in this
                // composition. Translated resources live in values-tr/.
                val context = LocalContext.current
                val locale = Locale.forLanguageTag(environment.settings.language.tag)
                val configuration = Configuration(LocalConfiguration.current).apply {
                    setLocale(locale)
                }
                val localizedContext = remember(context, configuration) {
                    context.createConfigurationContext(configuration)
                }
                CompositionLocalProvider(
                    LocalConfiguration provides configuration,
                    LocalContext provides localizedContext,
                    LocalResources provides localizedContext.resources,
                ) {
                    RootView(environment)
                }
            }
        }
    }

    /**
     * Android 13+ requires an explicit grant before the media notification (the
     * lock-screen/Android Auto transport) can appear in the shade.
     */
    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return
        }
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
