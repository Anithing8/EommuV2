package app.eommu.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import app.eommu.data.AppState
import app.eommu.data.Logic
import app.eommu.data.Recur
import app.eommu.data.Task
import java.time.LocalDate

/** One task as a raised card. Subtasks (open ones) are drawn inside it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TaskCard(
    s: AppState,
    task: Task,
    kids: List<Task>,
    showList: Boolean,
    onToggle: (String) -> Unit,
    onStar: (String) -> Unit,
    onOpen: (String) -> Unit,
    onDeleteKid: (String) -> Unit,
) {
    val today = LocalDate.now()
    val due = Logic.dueOf(s, task)
    val own = task.dueDate != null
    val late = due != null && !task.isCompleted && LocalDate.parse(due).isBefore(today)
    val list = Logic.list(s, task.listId)
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shadowElevation = 3.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onOpen(task.id) }
                    .padding(start = 12.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                RoundCheck(task.isCompleted, { onToggle(task.id) }, Modifier.padding(top = 2.dp))
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(
                        task.title.ifBlank { "Untitled" },
                        style = MaterialTheme.typography.bodyLarge,
                        textDecoration = if (task.isCompleted) TextDecoration.LineThrough else null,
                        color = if (task.isCompleted) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface,
                    )
                    if (task.notes.isNotBlank()) {
                        Text(
                            task.notes, style = MaterialTheme.typography.bodyMedium, maxLines = 2,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    val showDate = due != null && (own || showList || late)
                    if (showDate || task.recur != null || kids.isNotEmpty() || showList) {
                        FlowRow(
                            Modifier.padding(top = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            if (showDate) Pill((if (late) "Past due · " else "") + dateLabel(due!!, today), late)
                            if (own && task.dueTime != null) Pill(timeLabel(task.dueTime), late)
                            if (task.recur != null && task.recur.freq != "none") Pill("Repeats")
                            if (kids.isNotEmpty()) {
                                val all = Logic.children(s, task.id)
                                Pill("${all.count { it.isCompleted }}/${all.size}")
                            }
                            if (showList && list != null) Pill(list.name)
                        }
                    }
                }
                IconButton(onClick = { onStar(task.id) }) {
                    Icon(
                        if (task.isStarred) Icons.Default.Star else Icons.Default.StarBorder,
                        contentDescription = if (task.isStarred) "Remove priority star" else "Add priority star",
                        tint = if (task.isStarred) Amber else MaterialTheme.colorScheme.outline,
                    )
                }
            }
            kids.forEach { k ->
                SwipeDelete(onDelete = { onDeleteKid(k.id) }) {
                    Surface(color = MaterialTheme.colorScheme.surface) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { onOpen(k.id) }
                                .padding(start = 40.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RoundCheck(k.isCompleted, { onToggle(k.id) })
                            Text(
                                k.title.ifBlank { "Untitled" },
                                modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            if (k.isStarred) Icon(Icons.Default.Star, contentDescription = "Priority", tint = Amber, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        }
    }
}

/** Details sheet: everything about one task, with its subtasks. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskSheet(s: AppState, taskId: String, onUpdate: ((AppState) -> AppState) -> Unit, onDelete: (String) -> Unit, onClose: () -> Unit) {
    val t = Logic.task(s, taskId)
    if (t == null) { LaunchedEffect(Unit) { onClose() }; return }
    val sub = t.parentId != null
    var title by remember(taskId) { mutableStateOf(t.title) }
    var notes by remember(taskId) { mutableStateOf(t.notes) }
    var date by remember(taskId) { mutableStateOf(t.dueDate) }
    var time by remember(taskId) { mutableStateOf(t.dueTime) }
    var listId by remember(taskId) { mutableStateOf(t.listId) }
    var star by remember(taskId) { mutableStateOf(t.isStarred) }
    var freq by remember(taskId) { mutableStateOf(t.recur?.freq ?: "none") }
    var every by remember(taskId) { mutableStateOf((t.recur?.n ?: 1).toString()) }
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    var newSub by remember { mutableStateOf("") }
    val listDate = Logic.list(s, listId)?.dueDate
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    fun save() {
        val cleanTitle = title.trim().ifEmpty { t.title }
        onUpdate { st ->
            var out = Logic.updateTask(st, taskId) { old ->
                val d = date
                var due = d
                if (!sub && freq != "none" && due == null) due = listDate ?: Logic.todayStr()
                if (time != null && due == null) due = listDate ?: Logic.todayStr()
                val recur = if (sub || freq == "none") null else Recur(
                    freq = freq, n = (every.toIntOrNull() ?: 1).coerceIn(1, 365),
                    weekdays = if (freq == "week" && due != null) listOf(LocalDate.parse(due).dayOfWeek.value % 7) else emptyList(),
                    occ = old.recur?.occ ?: 1,
                    anchorDay = if ((freq == "month" || freq == "year") && due != null) LocalDate.parse(due).dayOfMonth else null,
                    end = old.recur?.end ?: app.eommu.data.RecurEnd(),
                )
                old.copy(
                    title = cleanTitle, notes = notes.take(4000), dueDate = due,
                    dueTime = if (due == null) null else time,
                    isStarred = star, starredAt = if (star) (old.starredAt ?: System.currentTimeMillis()) else null,
                    recur = recur,
                )
            }
            if (!sub && listId != t.listId) out = Logic.moveToList(out, taskId, listId)
            out
        }
    }

    ModalBottomSheet(onDismissRequest = { save(); onClose() }, sheetState = sheet) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(title, { title = it }, label = { Text("Title") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, minLines = 2, modifier = Modifier.fillMaxWidth())

            Text("Due", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = { pickDate = true }) { Text(date?.let { dateLabel(it) } ?: "Add date") }
                OutlinedButton(onClick = { pickTime = true }) { Text(time?.let { timeLabel(it) } ?: "Add time") }
                if (date != null || time != null) TextButton(onClick = { date = null; time = null }) { Text("Clear") }
            }
            if (date == null && listDate != null) {
                Text(
                    "No date of its own, so this task follows its list: ${dateLabel(listDate)}.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (!sub) {
                var menu by remember { mutableStateOf(false) }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Repeat, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column {
                        OutlinedButton(onClick = { menu = true }) {
                            Text(when (freq) { "day" -> "Every day(s)"; "week" -> "Every week(s)"; "month" -> "Every month(s)"; "year" -> "Every year(s)"; else -> "Does not repeat" })
                        }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            listOf("none" to "Does not repeat", "day" to "Days", "week" to "Weeks", "month" to "Months", "year" to "Years").forEach { (v, l) ->
                                DropdownMenuItem(text = { Text(l) }, onClick = { freq = v; menu = false })
                            }
                        }
                    }
                    if (freq != "none") {
                        OutlinedTextField(
                            every, { v -> every = v.filter { c -> c.isDigit() }.take(3) },
                            label = { Text("Every") }, singleLine = true, modifier = Modifier.weight(1f),
                            keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                        )
                    }
                }

                var listMenu by remember { mutableStateOf(false) }
                Text("List", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Column {
                    OutlinedButton(onClick = { listMenu = true }) { Text(Logic.list(s, listId)?.name ?: "Choose a list") }
                    DropdownMenu(expanded = listMenu, onDismissRequest = { listMenu = false }) {
                        s.lists.sortedBy { it.order }.forEach { l ->
                            DropdownMenuItem(text = { Text(l.name) }, onClick = { listId = l.id; listMenu = false })
                        }
                    }
                }
            }

            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Priority star", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                Switch(checked = star, onCheckedChange = { star = it })
            }

            if (!sub) {
                Text("Subtasks", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Logic.children(s, taskId).forEach { k ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RoundCheck(k.isCompleted, { onUpdate { st -> Logic.setCompleted(st, k.id, !k.isCompleted) } })
                        Text(k.title.ifBlank { "Untitled" }, Modifier.weight(1f).padding(horizontal = 12.dp))
                        IconButton(onClick = { onDelete(k.id) }) { Icon(Icons.Default.Close, contentDescription = "Delete subtask") }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        newSub, { newSub = it }, placeholder = { Text("Add a subtask") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = {
                            if (newSub.isNotBlank()) { val v = newSub; newSub = ""; onUpdate { st -> Logic.addTask(st, t.listId, v, parentId = taskId) } }
                        }),
                    )
                    IconButton(onClick = {
                        if (newSub.isNotBlank()) { val v = newSub; newSub = ""; onUpdate { st -> Logic.addTask(st, t.listId, v, parentId = taskId) } }
                    }) { Icon(Icons.Default.Add, contentDescription = "Add subtask") }
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { onDelete(taskId); onClose() }, modifier = Modifier.weight(1f)) { Text("Delete", color = Late) }
                Button(onClick = { save(); onClose() }, modifier = Modifier.weight(1f)) { Text("Save") }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
    if (pickDate) DatePickerSheet(date ?: listDate, { date = it }, { pickDate = false })
    if (pickTime) TimePickerSheet(time, { time = it }, { pickTime = false })
}
