package app.eommu.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

// ---------------------------------------------------------------- formatting

private val dayFmt = DateTimeFormatter.ofPattern("EEE, MMM d")

fun dateLabel(date: String, today: LocalDate = LocalDate.now()): String {
    val d = runCatching { LocalDate.parse(date) }.getOrNull() ?: return date
    return when (d) {
        today -> "Today"
        today.plusDays(1) -> "Tomorrow"
        today.minusDays(1) -> "Yesterday"
        else -> d.format(dayFmt)
    }
}

fun timeLabel(hm: String): String =
    runCatching { LocalTime.parse(hm).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)) }.getOrDefault(hm)

// ---------------------------------------------------------------- controls

/** The round check of the web app: an empty ring, or a green disc with a tick. */
@Composable
fun RoundCheck(done: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val ring = MaterialTheme.colorScheme.outline
    Box(
        modifier = modifier
            .size(28.dp)
            .clip(CircleShape)
            .then(if (done) Modifier.background(Done) else Modifier.border(BorderStroke(2.dp, ring), CircleShape))
            .clickable(role = Role.Checkbox, onClick = onToggle)
            .semantics { contentDescription = if (done) "Mark as not done" else "Mark as done" },
        contentAlignment = Alignment.Center,
    ) {
        if (done) Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
    }
}

/**
 * Swipe a row to the left to delete it. The swipe only counts once it has passed
 * 55% of the row width, and the caller shows an Undo, so a stray touch never loses a task.
 * Rows sit in a vertical list (not a pager), so swiping can never change the list.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeDelete(onDelete: () -> Unit, content: @Composable () -> Unit) {
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { v ->
            if (v == SwipeToDismissBoxValue.EndToStart) { onDelete(); true } else false
        },
        positionalThreshold = { total -> total * 0.55f },
    )
    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Box(
                Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Late)
                    .padding(end = 22.dp),
                contentAlignment = Alignment.CenterEnd,
            ) { Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.White) }
        },
        content = { content() },
    )
}

/** A small pill for a date, a time or a count. */
@Composable
fun Pill(text: String, late: Boolean = false, modifier: Modifier = Modifier) {
    val fg = if (late) Late else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f))
            .padding(horizontal = 9.dp, vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { Text(text, color = fg, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold) }
}

// ---------------------------------------------------------------- dialogs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerSheet(initial: String?, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val start = runCatching { LocalDate.parse(initial) }.getOrDefault(LocalDate.now())
    val state = rememberDatePickerState(initialSelectedDateMillis = start.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                val ms = state.selectedDateMillis
                if (ms != null) onPick(java.time.Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toString())
                onDismiss()
            }) { Text("OK") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    ) { DatePicker(state = state) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimePickerSheet(initial: String?, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val t = runCatching { LocalTime.parse(initial) }.getOrDefault(LocalTime.of(9, 0))
    val state = rememberTimePickerState(initialHour = t.hour, initialMinute = t.minute, is24Hour = false)
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                onPick("%02d:%02d".format(state.hour, state.minute))
                onDismiss()
            }) { Text("OK") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        text = { TimePicker(state = state) },
    )
}

@Composable
fun ConfirmDialog(title: String, message: String, confirm: String, danger: Boolean = false, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = { onConfirm(); onDismiss() }) {
                Text(confirm, color = if (danger) Late else MaterialTheme.colorScheme.primary)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
