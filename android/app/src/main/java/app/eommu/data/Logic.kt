package app.eommu.data

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.UUID
import kotlin.math.max
import kotlin.math.min

/** Pure rules, no Android classes: every function takes a state and returns a new one. */
object Logic {

    fun uid(prefix: String): String = prefix + UUID.randomUUID().toString().replace("-", "").take(12)

    fun today(): LocalDate = LocalDate.now()
    fun todayStr(): String = today().toString()
    fun isDate(s: String?): Boolean = s != null && runCatching { LocalDate.parse(s) }.isSuccess
    fun isTime(s: String?): Boolean = s != null && Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(s)

    // ---------------------------------------------------------------- lookups

    fun list(s: AppState, id: String?): TaskList? = s.lists.firstOrNull { it.id == id }
    fun task(s: AppState, id: String?): Task? = s.tasks.firstOrNull { it.id == id }
    fun defaultList(s: AppState): TaskList? = s.lists.firstOrNull { it.isDefault } ?: s.lists.firstOrNull()
    fun children(s: AppState, id: String): List<Task> = s.tasks.filter { it.parentId == id }.sortedBy { it.order }

    /** A task's own date, otherwise the date of its list. */
    fun dueOf(s: AppState, t: Task): String? = t.dueDate ?: list(s, t.listId)?.dueDate

    /** Replace one task. */
    private fun AppState.mapTask(id: String, f: (Task) -> Task): AppState =
        copy(tasks = tasks.map { if (it.id == id) f(it) else it })

    private fun nextOrder(s: AppState, listId: String, parentId: String?): Int =
        (s.tasks.filter { it.listId == listId && it.parentId == parentId }.maxOfOrNull { it.order } ?: 0) + 1

    // ---------------------------------------------------------------- tasks

    /** New tasks always go to the end of their list, so the order is the order you added them. */
    fun addTask(s: AppState, listId: String, title: String, parentId: String? = null, dueDate: String? = null, dueTime: String? = null): AppState {
        val parent = parentId?.let { task(s, it) }
        if (parent != null && parent.parentId != null) return s    // two levels only
        val lid = parent?.listId ?: listId
        if (list(s, lid) == null) return s
        val t = Task(
            id = uid("t"), listId = lid, parentId = parentId, title = title.trim().take(500),
            dueDate = dueDate, dueTime = if (dueDate != null) dueTime else null,
            order = nextOrder(s, lid, parentId), createdAt = System.currentTimeMillis(),
        )
        return s.copy(tasks = s.tasks + t)
    }

    fun updateTask(s: AppState, id: String, f: (Task) -> Task): AppState =
        s.mapTask(id) { old ->
            val n = f(old)
            n.copy(dueTime = if (n.dueDate == null) null else n.dueTime)
        }

    fun deleteTask(s: AppState, id: String): AppState =
        s.copy(tasks = s.tasks.filter { it.id != id && it.parentId != id })

    fun toggleStar(s: AppState, id: String): AppState =
        s.mapTask(id) { if (it.isStarred) it.copy(isStarred = false, starredAt = null) else it.copy(isStarred = true, starredAt = System.currentTimeMillis()) }

    /**
     * Check or uncheck. Completing a parent completes its subtasks; unchecking a subtask re-opens
     * its parent; completing a repeating parent creates the next one.
     */
    fun setCompleted(s: AppState, id: String, done: Boolean, now: Long = System.currentTimeMillis()): AppState {
        val t = task(s, id) ?: return s
        if (t.isCompleted == done) return s
        var out = s
        if (done) {
            out = out.mapTask(id) { it.copy(isCompleted = true, completedAt = now) }
            if (t.parentId == null) {
                out = out.copy(tasks = out.tasks.map {
                    if (it.parentId == id && !it.isCompleted) it.copy(isCompleted = true, completedAt = now) else it
                })
                if (t.recur != null && t.recur.freq != "none" && t.spawnedNextId == null) out = spawnNext(out, t)
            }
        } else {
            out = out.mapTask(id) { it.copy(isCompleted = false, completedAt = null) }
            val p = t.parentId?.let { task(out, it) }
            if (p != null && p.isCompleted) out = out.mapTask(p.id) { it.copy(isCompleted = false, completedAt = null) }
        }
        return out
    }

    fun moveToList(s: AppState, id: String, listId: String): AppState {
        val t = task(s, id) ?: return s
        if (list(s, listId) == null || t.parentId != null) return s
        val ord = nextOrder(s, listId, null)
        return s.copy(tasks = s.tasks.map {
            when {
                it.id == id -> it.copy(listId = listId, order = ord)
                it.parentId == id -> it.copy(listId = listId)
                else -> it
            }
        })
    }

    // ---------------------------------------------------------------- recurrence

    private fun jsDay(d: LocalDate) = d.dayOfWeek.value % 7          // Sunday = 0
    private fun monIdx(d: LocalDate) = d.dayOfWeek.value - 1         // Monday = 0

    private fun addMonths(base: LocalDate, n: Long, anchor: Int?): LocalDate {
        val first = base.withDayOfMonth(1).plusMonths(n)
        return first.withDayOfMonth(min(anchor ?: base.dayOfMonth, first.lengthOfMonth()))
    }

    private fun addYears(base: LocalDate, n: Long, anchor: Int?): LocalDate {
        val first = base.withDayOfMonth(1).plusYears(n)
        return first.withDayOfMonth(min(anchor ?: base.dayOfMonth, first.lengthOfMonth()))
    }

    private fun step(r: Recur, base: LocalDate): LocalDate? {
        val n = max(1, r.n).toLong()
        return when (r.freq) {
            "day" -> base.plusDays(n)
            "week" -> {
                val set = (if (r.weekdays.isEmpty()) listOf(jsDay(base)) else r.weekdays).map { (it + 6) % 7 }.sorted()
                val bi = monIdx(base)
                val later = set.firstOrNull { it > bi }
                if (later != null) base.plusDays((later - bi).toLong())
                else base.minusDays(bi.toLong()).plusWeeks(n).plusDays(set[0].toLong())
            }
            "month" -> addMonths(base, n, r.anchorDay)
            "year" -> addYears(base, n, r.anchorDay)
            else -> null
        }
    }

    fun nextOccurrence(t: Task, today: LocalDate = today()): LocalDate? {
        val r = t.recur ?: return null
        if (r.freq == "none") return null
        var next = step(r, t.dueDate?.let { LocalDate.parse(it) } ?: today)
        var guard = 0
        while (next != null && next.isBefore(today) && guard++ < 4000) next = step(r, next)
        if (next == null) return null
        when (r.end.type) {
            "date" -> if (isDate(r.end.date) && next.isAfter(LocalDate.parse(r.end.date))) return null
            "count" -> if (r.occ >= max(1, r.end.count ?: 1)) return null
        }
        return next
    }

    private fun spawnNext(s: AppState, t: Task): AppState {
        val next = nextOccurrence(t) ?: return s
        val delta = if (t.dueDate != null) java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(t.dueDate), next) else 0L
        val nt = t.copy(
            id = uid("t"), dueDate = next.toString(), isCompleted = false, completedAt = null,
            recur = t.recur?.let { r -> r.copy(occ = r.occ + 1) }, spawnedNextId = null,
            order = t.order, createdAt = System.currentTimeMillis(),
        )
        // sit right after the original in manual order
        val shifted = s.tasks.map { if (it.parentId == null && it.listId == t.listId && it.order > t.order) it.copy(order = it.order + 1) else it }
        val kids = children(s, t.id).mapIndexed { i, k ->
            k.copy(
                id = uid("t"), parentId = nt.id, isCompleted = false, completedAt = null, order = i + 1,
                dueDate = k.dueDate?.let { LocalDate.parse(it).plusDays(delta).toString() },
                createdAt = System.currentTimeMillis(), spawnedNextId = null,
            )
        }
        val marked = shifted.map { if (it.id == t.id) it.copy(spawnedNextId = nt.id) else it }
        return s.copy(tasks = marked + nt.copy(order = t.order + 1) + kids)
    }

    // ---------------------------------------------------------------- lists

    fun addList(s: AppState, name: String, dueDate: String? = null): AppState {
        val l = TaskList(
            id = uid("l"), name = name.trim().ifEmpty { "Untitled list" }.take(120),
            color = s.lists.size % 6, order = (s.lists.maxOfOrNull { it.order } ?: -1) + 1,
            dueDate = if (isDate(dueDate)) dueDate else null,
        )
        return s.copy(lists = s.lists + l)
    }

    fun updateList(s: AppState, id: String, f: (TaskList) -> TaskList): AppState =
        s.copy(lists = s.lists.map { if (it.id == id) f(it) else it })

    fun deleteList(s: AppState, id: String): AppState {
        val l = list(s, id) ?: return s
        if (l.isDefault) return s
        val def = defaultList(s.copy(lists = s.lists.filter { it.id != id }))
        return s.copy(
            lists = s.lists.filter { it.id != id },
            tasks = s.tasks.filter { it.listId != id },
            presets = s.presets.map { if (it.targetListId == id) it.copy(targetListId = def?.id) else it },
        )
    }

    // ---------------------------------------------------------------- views

    data class Row(val task: Task, val kids: List<Task>)

    /** Open top-level tasks of a list in the list's sort mode, each with its open subtasks. */
    fun openUnits(s: AppState, l: TaskList): List<Row> {
        val mine = s.tasks.filter { it.listId == l.id && !it.isCompleted }
        val tops = mine.filter { it.parentId == null }
        val units = tops.map { p -> Row(p, mine.filter { it.parentId == p.id }.sortedBy { it.order }) }
        return when (l.sort) {
            "due" -> units.sortedWith(compareBy<Row>({ dueOf(s, it.task) ?: "9999-99-99" }, { it.task.dueTime ?: "" }, { it.task.order }))
            "starred" -> units.sortedWith(compareBy<Row>({ !it.task.isStarred }, { -(it.task.starredAt ?: 0L) }, { it.task.order }))
            "title" -> units.sortedWith(compareBy<Row>({ it.task.title.lowercase() }, { it.task.order }))
            else -> units.sortedBy { it.task.order }
        }
    }

    fun completedUnits(s: AppState, l: TaskList): List<Row> {
        val mine = s.tasks.filter { it.listId == l.id && it.isCompleted }
        return mine.filter { it.parentId == null }
            .sortedByDescending { it.completedAt ?: 0L }
            .map { p -> Row(p, children(s, p.id)) }
    }

    fun openCount(s: AppState, l: TaskList): Int = s.tasks.count { it.listId == l.id && it.parentId == null && !it.isCompleted }

    /** Everything open that is due today or earlier. */
    fun todayTasks(s: AppState, today: String = todayStr()): List<Task> =
        s.tasks.filter { !it.isCompleted && dueOf(s, it)?.let { d -> d <= today } == true }
            .sortedWith(compareBy<Task>({ dueOf(s, it) ?: "" }, { it.dueTime ?: "" }, { it.order }))

    data class Stats(val done: Int, val total: Int, val pct: Int)

    fun todayStats(s: AppState, today: String = todayStr()): Stats {
        val dueToday = s.tasks.filter { dueOf(s, it) == today }
        val overdue = s.tasks.count { !it.isCompleted && dueOf(s, it)?.let { d -> d < today } == true }
        val done = dueToday.count { it.isCompleted }
        val total = dueToday.size + overdue
        return Stats(done, total, if (total == 0) 0 else Math.round(done * 100f / total))
    }

    /** Tasks for one calendar day: all-day first, then by clock time. */
    fun tasksOn(s: AppState, date: String): List<Task> =
        s.tasks.filter { dueOf(s, it) == date }
            .sortedWith(compareBy<Task>({ it.dueTime ?: "" }, { it.isCompleted }, { it.order }))

    /** Reminders that have not fired yet, soonest first. */
    fun upcomingReminders(s: AppState, from: LocalDateTime = LocalDateTime.now()): List<Pair<Task, LocalDateTime>> =
        s.tasks.filter { !it.isCompleted && it.dueDate != null && isTime(it.dueTime) }
            .mapNotNull { t ->
                runCatching { t to LocalDateTime.of(LocalDate.parse(t.dueDate!!), LocalTime.parse(t.dueTime!!)) }.getOrNull()
            }
            .filter { it.second.isAfter(from.minusDays(1)) }
            .sortedBy { it.second }

    // ---------------------------------------------------------------- presets

    fun presetFromList(s: AppState, listId: String, name: String): AppState {
        val l = list(s, listId) ?: return s
        val tops = s.tasks.filter { it.listId == listId && it.parentId == null && !it.isCompleted }.sortedBy { it.order }
        val items = mutableListOf<PresetItem>()
        tops.forEachIndexed { i, t ->
            val pid = uid("i")
            items += PresetItem(pid, null, t.title, t.notes, t.isStarred, t.dueTime, i + 1)
            children(s, t.id).filter { !it.isCompleted }.forEachIndexed { j, k ->
                items += PresetItem(uid("i"), pid, k.title, k.notes, k.isStarred, k.dueTime, j + 1)
            }
        }
        val p = Preset(id = uid("p"), name = name.trim().ifEmpty { l.name }, targetListId = listId, items = items)
        return s.copy(presets = s.presets + p)
    }

    data class CopyResult(val state: AppState, val created: Int)

    /**
     * Copy a preset onto a date. In "skip" mode an item that is already there for that date
     * (finished or not) is not added again, so pressing the button twice is harmless.
     */
    fun copyPreset(s: AppState, presetId: String, date: String, listId: String? = null): CopyResult {
        val p = s.presets.firstOrNull { it.id == presetId } ?: return CopyResult(s, 0)
        val lid = listId ?: p.targetListId?.takeIf { list(s, it) != null } ?: defaultList(s)?.id ?: return CopyResult(s, 0)
        var out = s
        if (p.conflictMode == "fresh") {
            out = out.copy(tasks = out.tasks.filter { !(it.presetId == p.id && it.listId == lid && !it.isCompleted && (dueOfOwn(it) ?: date) <= date) })
        }
        val existing = out.tasks.filter { it.presetId == p.id && it.dueDate == date }.mapNotNull { it.presetItemId }.toSet()
        val idMap = HashMap<String, String>()
        var created = 0
        val add = mutableListOf<Task>()
        var ord = (out.tasks.filter { it.listId == lid && it.parentId == null }.maxOfOrNull { it.order } ?: 0)
        val tops = p.items.filter { it.parentId == null }.sortedBy { it.order }
        for (pi in tops) {
            if (p.conflictMode == "skip" && pi.id in existing) continue
            val tid = uid("t"); idMap[pi.id] = tid
            add += Task(
                id = tid, listId = lid, title = pi.title, notes = pi.notes, isStarred = pi.isStarred,
                starredAt = if (pi.isStarred) System.currentTimeMillis() else null,
                dueDate = date, dueTime = pi.time, order = ++ord, createdAt = System.currentTimeMillis(),
                presetId = p.id, presetItemId = pi.id,
            )
            created++
            var j = 0
            for (k in p.items.filter { c -> c.parentId == pi.id }.sortedBy { c -> c.order }) {
                add += Task(
                    id = uid("t"), listId = lid, parentId = tid, title = k.title, notes = k.notes, isStarred = k.isStarred,
                    starredAt = if (k.isStarred) System.currentTimeMillis() else null,
                    dueDate = date, dueTime = k.time, order = ++j, createdAt = System.currentTimeMillis(),
                    presetId = p.id, presetItemId = k.id,
                )
            }
        }
        out = out.copy(
            tasks = out.tasks + add,
            presets = out.presets.map { if (it.id == p.id) it.copy(lastCopiedDate = date) else it },
            settings = out.settings.copy(lastPresetId = p.id),
        )
        return CopyResult(out, created)
    }

    private fun dueOfOwn(t: Task) = t.dueDate

    // ---------------------------------------------------------------- repair

    /** Make any state safe to use: a default list, valid sorts, no orphans, no third level. */
    fun normalize(s0: AppState): AppState {
        var s = s0
        if (s.lists.isEmpty()) s = s.copy(lists = listOf(TaskList(id = uid("l"), name = "My tasks", isDefault = true)))
        if (s.lists.none { it.isDefault }) s = s.copy(lists = s.lists.mapIndexed { i, l -> if (i == 0) l.copy(isDefault = true) else l })
        val sorts = setOf("manual", "due", "starred", "title")
        s = s.copy(lists = s.lists.map { l ->
            l.copy(
                sort = if (l.sort in sorts) l.sort else "manual",
                name = l.name.ifBlank { "Untitled list" },
                dueDate = if (isDate(l.dueDate)) l.dueDate else null,
            )
        })
        val listIds = s.lists.map { it.id }.toSet()
        val def = defaultList(s)!!.id
        val seen = HashSet<String>()
        var tasks = s.tasks.filter { seen.add(it.id) }.map { t ->
            t.copy(
                listId = if (t.listId in listIds) t.listId else def,
                dueDate = if (isDate(t.dueDate)) t.dueDate else null,
                dueTime = if (isDate(t.dueDate) && isTime(t.dueTime)) t.dueTime else null,
                completedAt = if (t.isCompleted) t.completedAt else null,
                starredAt = if (t.isStarred) t.starredAt else null,
            )
        }
        val byId = tasks.associateBy { it.id }
        tasks = tasks.map { t ->
            val p = t.parentId?.let { byId[it] }
            when {
                t.parentId == null -> t
                p == null || p.parentId != null || p.id == t.id -> t.copy(parentId = null)
                else -> t.copy(listId = p.listId, recur = null)
            }
        }
        // contiguous order per sibling group
        val renum = HashMap<String, Int>()
        tasks.groupBy { Triple(it.listId, it.parentId, 0) }.values.forEach { g ->
            g.sortedBy { it.order }.forEachIndexed { i, t -> renum[t.id] = i + 1 }
        }
        return s.copy(tasks = tasks.map { it.copy(order = renum[it.id] ?: it.order) })
    }

    // ---------------------------------------------------------------- sample data

    fun sample(): AppState {
        val today = today()
        var s = AppState()
        s = addList(s, "My tasks").let { st -> st.copy(lists = st.lists.map { it.copy(isDefault = true) }) }
        s = addList(s, "Today’s schedule")
        s = addList(s, "Work")
        s = addList(s, "Home")
        val ids = s.lists.map { it.id }
        fun add(listIdx: Int, title: String, due: LocalDate? = null, time: String? = null, star: Boolean = false, kids: List<String> = emptyList()) {
            s = addTask(s, ids[listIdx], title, dueDate = due?.toString(), dueTime = time)
            val id = s.tasks.last().id
            if (star) s = toggleStar(s, id)
            kids.forEach { s = addTask(s, ids[listIdx], it, parentId = id) }
        }
        add(0, "Pay the electricity bill", today.minusDays(1), star = true)
        add(0, "Renew library card", today.plusDays(2))
        add(0, "Plan the weekend trip", today.plusDays(3), kids = listOf("Book train tickets", "Reserve the guesthouse", "Write a packing list"))
        add(2, "Draft the project outline", today, "15:00", star = true, kids = listOf("List the three goals", "Sketch the timeline"))
        add(2, "Send the weekly update", today.plusDays(1), "16:00")
        add(3, "Water the plants", today, "18:00")
        val morning = Preset(
            id = uid("p"), name = "Morning routine", targetListId = ids[1],
            items = listOf(
                PresetItem(uid("i"), null, "Stretch and water", "", false, "06:30", 1),
                PresetItem(uid("i"), null, "Plan the day", "", true, "07:00", 2),
                PresetItem(uid("i"), null, "Read for 20 minutes", "", false, "07:30", 3),
            ),
        )
        return s.copy(presets = listOf(morning))
    }
}
