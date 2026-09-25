package app.ezber.android.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The Ezber design language, mirroring the kit tokens that
 * `ios/Ezber/DesignSystem/EzberTheme.swift` is also built from: a warm greige
 * background and card, a deep green primary for actions and progress, and muted
 * honey [accent] reserved for the active-verse cue — never a CTA, progress fill
 * or tint.
 *
 * Transliteration stays in a serif face, as the kit's Source Serif 4 does on
 * iOS; bundling the kit's OFL font files on Android is a follow-up.
 */
@Immutable
data class EzberColors(
    val background: Color,
    val foreground: Color,
    val card: Color,
    val cardForeground: Color,
    val primary: Color,
    val primaryForeground: Color,
    val secondary: Color,
    val secondaryForeground: Color,
    val muted: Color,
    val mutedForeground: Color,
    val accent: Color,
    val accentForeground: Color,
    val destructive: Color,
    val destructiveForeground: Color,
    val border: Color,
    val isDark: Boolean,
)

private val LightEzberColors = EzberColors(
    background = Color(0xFFEDEBE5),
    foreground = Color(0xFF211F19),
    card = Color(0xFFF8F7F2),
    cardForeground = Color(0xFF211F19),
    primary = Color(0xFF344F3D),
    primaryForeground = Color(0xFFF7F5EF),
    secondary = Color(0xFFDBE0D6),
    secondaryForeground = Color(0xFF1F261D),
    muted = Color(0xFFE2DFDA),
    mutedForeground = Color(0xFF66635A),
    accent = Color(0xFFE0CFAC),
    accentForeground = Color(0xFF3B2A17),
    destructive = Color(0xFF8F4E44),
    destructiveForeground = Color(0xFFF7F5EF),
    border = Color(0xFFD4D1C8),
    isDark = false,
)

private val DarkEzberColors = EzberColors(
    background = Color(0xFF0F0D08),
    foreground = Color(0xFFEAE8E0),
    card = Color(0xFF191711),
    cardForeground = Color(0xFFEAE8E0),
    primary = Color(0xFF83B28C),
    primaryForeground = Color(0xFF071009),
    secondary = Color(0xFF242821),
    secondaryForeground = Color(0xFFEAE8E0),
    muted = Color(0xFF26241E),
    mutedForeground = Color(0xFF9B9890),
    accent = Color(0xFF7E6438),
    accentForeground = Color(0xFFF5EEE0),
    destructive = Color(0xFFB67166),
    destructiveForeground = Color(0xFF0F0D08),
    border = Color(0x1FEAE8E0),
    isDark = true,
)

val LocalEzberColors = staticCompositionLocalOf { LightEzberColors }

@Composable
fun EzberTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val ezberColors = remember(darkTheme) { if (darkTheme) DarkEzberColors else LightEzberColors }
    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = ezberColors.primary,
            onPrimary = ezberColors.primaryForeground,
            secondary = ezberColors.secondary,
            onSecondary = ezberColors.secondaryForeground,
            background = ezberColors.background,
            onBackground = ezberColors.foreground,
            surface = ezberColors.card,
            onSurface = ezberColors.cardForeground,
            surfaceVariant = ezberColors.muted,
            onSurfaceVariant = ezberColors.mutedForeground,
            error = ezberColors.destructive,
            onError = ezberColors.destructiveForeground,
            outline = ezberColors.border,
        )
    } else {
        lightColorScheme(
            primary = ezberColors.primary,
            onPrimary = ezberColors.primaryForeground,
            secondary = ezberColors.secondary,
            onSecondary = ezberColors.secondaryForeground,
            background = ezberColors.background,
            onBackground = ezberColors.foreground,
            surface = ezberColors.card,
            onSurface = ezberColors.cardForeground,
            surfaceVariant = ezberColors.muted,
            onSurfaceVariant = ezberColors.mutedForeground,
            error = ezberColors.destructive,
            onError = ezberColors.destructiveForeground,
            outline = ezberColors.border,
        )
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
        content = {
            CompositionLocalProvider(
                LocalEzberColors provides ezberColors,
                content = content,
            )
        },
    )
}
