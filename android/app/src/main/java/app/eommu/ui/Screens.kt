package app.eommu.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import app.eommu.data.AppState
import app.eommu.data.Logic
import app.eommu.data.Store
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Everything the screens can do, in one place. Each change goes through Store.update. */
class Ui(val store: Store, private val snack: SnackbarHostState, private val scope: CoroutineScope) {
    fun toggle(id: String) = store.update { s -> Logic.setCompleted(s, id, !(Logic.task(s, id)?.isCompleted ?: false)) }
    fun star(id: String) = store.update { s -> Logic.toggleStar(s, id) }

    fun say(message: String) {
        scope.launch { snack.currentSnackbarData?.dismiss(); snack.showSnackbar(message) }
    }

    /** Delete with an Undo that puts everything back the way it was. */
    fun delete(id: String) {
        val before = store.state.value
        val kids = Logic.children(before, id).size
        store.update { s -> Logic.deleteTask(s, id) }
        scope.launch {
            snack.currentSnackbarData?.dismiss()
            val r = snack.showSnackbar(
                if (kids > 0) "Task and $kids subtask${if (kids > 1) "s" else ""} deleted" else "Deleted",
                actionLabel = "Undo",
            )
            if (r == SnackbarResult.ActionPerformed) store.update { before }
        }
    }
}

// ================================================================ lists

private val sortNames = mapOf("manual" to "My order", "due" to "Due date", "starred" to "Starred", "title" to "Title A–Z")

@Composable
fun ListsScreen(s: AppState, ui: Ui, onOpen: (String) -> Unit) {
    val lists = s.lists.sortedBy { it.order }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val current = lists.firstOrNull { it.id == selected } ?: Logic.defaultList(s) ?: return
    var newList by remember { mutableStateOf(false) }
    var dateFor by remember { mutableStateOf<String?>(null) }
    var renameFor by remember { mutableStateOf<String?>(null) }
    var deleteFor by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }

    val units = Logic.openUnits(s, current)
    val done = Logic.completedUnits(s, current)

    Column(Modifier.fillMaxSize()) {
        ScrollableTabRow(
            selectedTabIndex = lists.indexOf(current).coerceAtLeast(0),
            edgePadding = 8.dp, containerColor = Color.Transparent, divider = {},
        ) {
            lists.forEach { l ->
                Tab(
                    selected = l.id == current.id, onClick = { selected = l.id },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(9.dp).background(ListColors[l.color.mod(ListColors.size)], CircleShape))
                            Text(l.name, maxLines = 1)
                            val n = Logic.openCount(s, l)
                            if (n > 0) Text("$n", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.outline)
                        }
                    },
                )
            }
            Tab(selected = false, onClick = { newList = true }, icon = { Icon(Icons.Default.Add, contentDescription = "New list") })
        }

        ListHeader(s, current, ui, onDate = { dateFor = current.id }, onRename = { renameFor = current.id }, onDelete = { deleteFor = current.id })

        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (units.isEmpty()) {
                item {
                    Text(
                        if (done.isEmpty()) "Nothing here yet. Add a task below." else "All done here.",
                        color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(24.dp),
                    )
                }
            }
            items(units, key = { it.task.id }) { u ->
                SwipeDelete(onDelete = { ui.delete(u.task.id) }) {
                    TaskCard(s, u.task, u.kids, false, ui::toggle, ui::star, onOpen, ui::delete)
                }
            }
            if (done.isNotEmpty()) {
                item(key = "completed-head") {
                    TextButton(onClick = { ui.store.update { st -> Logic.updateList(st, current.id) { it.copy(completedOpen = !it.completedOpen) } } }) {
                        Text("${if (current.completedOpen) "Hide" else "Show"} completed (${done.sumOf { 1 + it.kids.size }})")
                    }
                }
                if (current.completedOpen) {
                    items(done, key = { "d" + it.task.id }) { u ->
                        SwipeDelete(onDelete = { ui.delete(u.task.id) }) {
                            TaskCard(s, u.task, u.kids.filter { !it.isCompleted }, false, ui::toggle, ui::star, onOpen, ui::delete)
                        }
                    }
                }
            }
        }

        // the add box sits at the bottom; a new task always lands at the end of the list
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                draft, { draft = it }, modifier = Modifier.weight(1f), singleLine = true,
                placeholder = { Text("Add a task to ${current.name}") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = {
                    if (draft.isNotBlank()) { val v = draft; draft = ""; ui.store.update { st -> Logic.addTask(st, current.id, v) } }
                }),
                shape = RoundedCornerShape(14.dp),
            )
            IconButton(onClick = {
                if (draft.isNotBlank()) { val v = draft; draft = ""; ui.store.update { st -> Logic.addTask(st, current.id, v) } }
            }) { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Add task") }
        }
    }

    if (newList) NewListDialog(onCreate = { name, date ->
        ui.store.update { st -> Logic.addList(st, name, date) }
        newList = false
        selected = ui.store.state.value.lists.maxByOrNull { it.order }?.id
    }, onDismiss = { newList = false })

    dateFor?.let { id ->
        val l = Logic.list(s, id)
        if (l != null) DatePickerSheet(l.dueDate, { d -> ui.store.update { st -> Logic.updateList(st, id) { it.copy(dueDate = d) } } }, { dateFor = null })
        else dateFor = null
    }
    renameFor?.let { id ->
        val l = Logic.list(s, id)
        if (l != null) TextPrompt("Rename list", l.name, "Save", { v -> ui.store.update { st -> Logic.updateList(st, id) { it.copy(name = v.take(120)) } } }, { renameFor = null })
        else renameFor = null
    }
    deleteFor?.let { id ->
        val l = Logic.list(s, id)
        if (l != null) {
            val n = s.tasks.count { it.listId == id }
            ConfirmDialog("Delete this list?", "“${l.name}” and its $n task${if (n == 1) "" else "s"} will be deleted.", "Delete list", true,
                onConfirm = { selected = null; ui.store.update { st -> Logic.deleteList(st, id) } }, onDismiss = { deleteFor = null })
        } else deleteFor = null
    }
}

@Composable
private fun ListHeader(s: AppState, l: app.eommu.data.TaskList, ui: Ui, onDate: () -> Unit, onRename: () -> Unit, onDelete: () -> Unit) {
    var sortMenu by remember { mutableStateOf(false) }
    var more by remember { mutableStateOf(false) }
    var presetName by remember { mutableStateOf<String?>(null) }
    var clear by remember { mutableStateOf(false) }
    val today = LocalDate.now()
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (l.dueDate != null) {
            val late = LocalDate.parse(l.dueDate).isBefore(today) && Logic.openCount(s, l) > 0
            OutlinedButton(onClick = onDate) { Text((if (late) "Past due · " else "") + dateLabel(l.dueDate, today), color = if (late) Late else MaterialTheme.colorScheme.onSurface) }
        }
        Box {
            TextButton(onClick = { sortMenu = true }) { Text(sortNames[l.sort] ?: "My order") }
            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                sortNames.forEach { (k, v) ->
                    DropdownMenuItem(
                        text = { Text(if (k == l.sort) "✓  $v" else v) },
                        onClick = { sortMenu = false; ui.store.update { st -> Logic.updateList(st, l.id) { it.copy(sort = k) } } },
                    )
                }
            }
        }
        Box(Modifier.weight(1f))
        Box {
            IconButton(onClick = { more = true }) { Icon(Icons.Default.MoreVert, contentDescription = "List actions") }
            DropdownMenu(expanded = more, onDismissRequest = { more = false }) {
                DropdownMenuItem(text = { Text("Rename") }, onClick = { more = false; onRename() })
                DropdownMenuItem(text = { Text(if (l.dueDate == null) "Set list date…" else "Change list date…") }, onClick = { more = false; onDate() })
                if (l.dueDate != null) DropdownMenuItem(text = { Text("Clear list date") }, onClick = { more = false; ui.store.update { st -> Logic.updateList(st, l.id) { it.copy(dueDate = null) } } })
                DropdownMenuItem(text = { Text("Save as preset…") }, onClick = { more = false; presetName = l.name })
                DropdownMenuItem(text = { Text("Delete completed") }, onClick = { more = false; clear = true })
                if (!l.isDefault) DropdownMenuItem(text = { Text("Delete list", color = Late) }, onClick = { more = false; onDelete() })
            }
        }
    }
    presetName?.let { n ->
        TextPrompt("Save “${l.name}” as a preset", n, "Save", { v ->
            ui.store.update { st -> Logic.presetFromList(st, l.id, v) }
            ui.say("Preset saved. Find it under Presets.")
        }, { presetName = null })
    }
    if (clear) {
        val n = s.tasks.count { it.listId == l.id && it.isCompleted }
        ConfirmDialog("Clear completed?", "$n finished task${if (n == 1) "" else "s"} will be deleted.", "Delete", true,
            onConfirm = {
                ui.store.update { st -> st.copy(tasks = st.tasks.filter { !(it.listId == l.id && it.isCompleted) }) }
                ui.say("$n deleted")
            }, onDismiss = { clear = false })
    }
}

@Composable
private fun NewListDialog(onCreate: (String, String?) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var date by remember { mutableStateOf<String?>(null) }
    var pick by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New list") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("List name") }, singleLine = true)
                Text("Date (optional). A dated list is for one day, and its tasks show on the calendar that day.", style = MaterialTheme.typography.bodyMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { pick = true }) { Text(date?.let { dateLabel(it) } ?: "Pick a date") }
                    if (date != null) TextButton(onClick = { date = null }) { Text("Clear") }
                }
            }
        },
        confirmButton = { TextButton(onClick = { if (name.isNotBlank()) onCreate(name, date) }) { Text("Create list") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
    if (pick) DatePickerSheet(date, { date = it }, { pick = false })
}

@Composable
fun TextPrompt(title: String, initial: String, confirm: String, onSubmit: (String) -> Unit, onDismiss: () -> Unit) {
    var v by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(v, { v = it }, singleLine = true) },
        confirmButton = { TextButton(onClick = { if (v.isNotBlank()) { onSubmit(v.trim()); onDismiss() } }) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ================================================================ today

@Composable
fun TodayScreen(s: AppState, ui: Ui, onOpen: (String) -> Unit) {
    val today = Logic.todayStr()
    val stats = Logic.todayStats(s, today)
    val open = Logic.todayTasks(s, today)
    val past = open.filter { (Logic.dueOf(s, it) ?: today) < today }
    val now = open.filter { (Logic.dueOf(s, it) ?: today) == today }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), elevation = CardDefaults.cardElevation(3.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${stats.pct}%", style = MaterialTheme.typography.titleLarge)
                    LinearProgressIndicator(progress = { stats.pct / 100f }, modifier = Modifier.fillMaxWidth(), color = if (stats.total > 0 && stats.done == stats.total) Done else Amber)
                    Text(
                        if (stats.total == 0) "Nothing is due today." else "${stats.done} of ${stats.total} done" + if (stats.done == stats.total) ". Well done." else "",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (past.isNotEmpty()) item { Text("Past due", color = Late, fontWeight = FontWeight.Bold) }
        items(past, key = { "p" + it.id }) { t -> TodayRow(s, ui, t, onOpen) }
        if (now.isNotEmpty()) item { Text("Today", fontWeight = FontWeight.Bold) }
        items(now, key = { "n" + it.id }) { t -> TodayRow(s, ui, t, onOpen) }
    }
}

@Composable
private fun TodayRow(s: AppState, ui: Ui, t: app.eommu.data.Task, onOpen: (String) -> Unit) {
    SwipeDelete(onDelete = { ui.delete(t.id) }) {
        TaskCard(s, t, emptyList(), true, ui::toggle, ui::star, onOpen, ui::delete)
    }
}

// ================================================================ calendar

@Composable
fun CalendarScreen(s: AppState, ui: Ui, onOpen: (String) -> Unit) {
    var selected by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var week by rememberSaveable { mutableStateOf(true) }
    val sel = LocalDate.parse(selected)
    val monday = sel.minusDays((sel.dayOfWeek.value - 1).toLong())
    val days = (0..6).map { monday.plusDays(it.toLong()) }
    val shown = if (week) days else listOf(sel)
    val today = LocalDate.now()

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { selected = sel.minusDays(if (week) 7 else 1).toString() }) { Icon(Icons.Default.ChevronLeft, contentDescription = "Previous") }
            TextButton(onClick = { selected = today.toString() }) { Text("Today") }
            IconButton(onClick = { selected = sel.plusDays(if (week) 7 else 1).toString() }) { Icon(Icons.Default.ChevronRight, contentDescription = "Next") }
            Text(
                if (week) "${days.first().format(java.time.format.DateTimeFormatter.ofPattern("MMM d"))} – ${days.last().format(java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy"))}"
                else sel.format(java.time.format.DateTimeFormatter.ofPattern("EEEE, MMM d")),
                modifier = Modifier.weight(1f).padding(start = 6.dp), fontWeight = FontWeight.SemiBold,
            )
            FilterChip(selected = !week, onClick = { week = false }, label = { Text("Day") })
            Box(Modifier.size(6.dp))
            FilterChip(selected = week, onClick = { week = true }, label = { Text("7 days") })
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            days.forEach { d ->
                val n = Logic.tasksOn(s, d.toString()).count { !it.isCompleted }
                val on = d == sel
                Column(
                    Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (on) MaterialTheme.colorScheme.primary else Color.Transparent)
                        .clickable { selected = d.toString() }
                        .padding(horizontal = 9.dp, vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    val fg = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                    Text(d.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault()), style = MaterialTheme.typography.labelMedium, color = fg)
                    Text("${d.dayOfMonth}", fontWeight = FontWeight.Bold, color = if (d == today && !on) Amber else fg)
                    Text(if (n > 0) "•".repeat(minOf(n, 3)) else " ", color = if (on) fg else Amber, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            shown.forEach { d ->
                val list = Logic.tasksOn(s, d.toString())
                item(key = "h$d") {
                    Text(
                        dateLabel(d.toString(), today) + if (list.isEmpty()) "  ·  nothing planned" else "",
                        fontWeight = FontWeight.Bold,
                        color = if (list.isEmpty()) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface,
                    )
                }
                items(list, key = { "c${d}${it.id}" }) { t ->
                    SwipeDelete(onDelete = { ui.delete(t.id) }) { TaskCard(s, t, emptyList(), true, ui::toggle, ui::star, onOpen, ui::delete) }
                }
            }
        }
    }
}

// ================================================================ presets

@Composable
fun PresetsScreen(s: AppState, ui: Ui) {
    var pickList by remember { mutableStateOf(false) }
    var deleteId by remember { mutableStateOf<String?>(null) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text(
                "A preset is a reusable plan for a day. Copy it to today or tomorrow in one tap. Copying twice never adds the same item twice.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        items(s.presets, key = { it.id }) { p ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), elevation = CardDefaults.cardElevation(3.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(p.name, style = MaterialTheme.typography.titleMedium)
                    val target = Logic.list(s, p.targetListId)?.name ?: "default list"
                    Text("${p.items.size} item${if (p.items.size == 1) "" else "s"} · goes to $target", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    p.items.filter { it.parentId == null }.sortedBy { it.order }.take(4).forEach {
                        Text((it.time?.let { t -> timeLabel(t) + "  " } ?: "") + it.title, style = MaterialTheme.typography.bodyMedium)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { copyPresetTo(s, ui, p.id, LocalDate.now(), "today") }) {
                            Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text("  Copy to today")
                        }
                        OutlinedButton(onClick = { copyPresetTo(s, ui, p.id, LocalDate.now().plusDays(1), "tomorrow") }) { Text("Tomorrow") }
                        TextButton(onClick = { deleteId = p.id }) { Text("Delete", color = Late) }
                    }
                }
            }
        }
        item {
            OutlinedButton(onClick = { pickList = true }, modifier = Modifier.fillMaxWidth()) { Text("Create a preset from a list") }
        }
    }
    if (pickList) {
        AlertDialog(
            onDismissRequest = { pickList = false },
            title = { Text("Which list?") },
            text = {
                Column {
                    s.lists.sortedBy { it.order }.forEach { l ->
                        TextButton(onClick = {
                            pickList = false
                            ui.store.update { st -> Logic.presetFromList(st, l.id, l.name) }
                            ui.say("Preset “${l.name}” created.")
                        }, modifier = Modifier.fillMaxWidth()) { Text(l.name) }
                    }
                }
            },
            confirmButton = {}, dismissButton = { TextButton(onClick = { pickList = false }) { Text("Cancel") } },
        )
    }
    deleteId?.let { id ->
        val p = s.presets.firstOrNull { it.id == id }
        if (p != null) ConfirmDialog("Delete preset?", "“${p.name}” will be deleted. Tasks already copied stay where they are.", "Delete", true,
            onConfirm = { ui.store.update { st -> st.copy(presets = st.presets.filter { it.id != id }) } }, onDismiss = { deleteId = null })
        else deleteId = null
    }
}

private fun copyPresetTo(s: AppState, ui: Ui, presetId: String, date: LocalDate, word: String) {
    val res = Logic.copyPreset(s, presetId, date.toString())
    if (res.created == 0) { ui.say("Already in your list for $word."); return }
    ui.store.update { res.state }
    ui.say("${res.created} added for $word.")
}
