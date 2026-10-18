package app.eommu.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Amber = Color(0xFFE39B14)
val Done = Color(0xFF2E9E5B)
val Late = Color(0xFFD63D32)

/** Pigments shared by lists, in the same order as the web app. */
val ListColors = listOf(
    Color(0xFF4F7CAC), Color(0xFF6E9C74), Color(0xFF9B6BA6),
    Color(0xFFC9892B), Color(0xFFB5645B), Color(0xFF5F9EA0),
)

private val Light = lightColorScheme(
    primary = Color(0xFF2B3A4A), onPrimary = Color.White,
    secondary = Amber, onSecondary = Color(0xFF241800),
    tertiary = Done,
    background = Color(0xFFD5DADB), onBackground = Color(0xFF1B2227),
    surface = Color(0xFFE8EBEB), onSurface = Color(0xFF1B2227),
    surfaceVariant = Color(0xFFC6CBCC), onSurfaceVariant = Color(0xFF4B565E),
    surfaceContainer = Color(0xFFDDE1E1), surfaceContainerHigh = Color(0xFFE4E7E7),
    outline = Color(0xFF8C979E), error = Late,
)

private val Dark = darkColorScheme(
    primary = Color(0xFFB8C7D6), onPrimary = Color(0xFF0F1A24),
    secondary = Color(0xFFFFB52E), onSecondary = Color(0xFF241800),
    tertiary = Color(0xFF43C77C),
    background = Color(0xFF1B1E21), onBackground = Color(0xFFE6E9EB),
    surface = Color(0xFF2B2F33), onSurface = Color(0xFFE6E9EB),
    surfaceVariant = Color(0xFF1F2224), onSurfaceVariant = Color(0xFFA6B0B7),
    surfaceContainer = Color(0xFF25282B), surfaceContainerHigh = Color(0xFF35393D),
    outline = Color(0xFF6B757C), error = Color(0xFFEF5D52),
)

private val Type = Typography(
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.sp),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
)

@Composable
fun EommuTheme(mode: String, content: @Composable () -> Unit) {
    val dark = when (mode) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Type, content = content)
}
