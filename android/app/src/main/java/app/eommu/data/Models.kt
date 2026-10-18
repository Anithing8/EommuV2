package app.eommu.data

import kotlinx.serialization.Serializable

/**
 * The data model deliberately matches the Eommu web app's backup file, so a backup made in the
 * browser can be imported here and the other way round.
 */
@Serializable
data class AppState(
    val v: Int = 1,
    val lists: List<TaskList> = emptyList(),
    val tasks: List<Task> = emptyList(),
    val presets: List<Preset> = emptyList(),
    val settings: Settings = Settings(),
)

@Serializable
data class TaskList(
    val id: String,
    val name: String = "Untitled list",
    val isDefault: Boolean = false,
    val sort: String = "manual",      // manual | due | starred | title
    val visible: Boolean = true,
    val completedOpen: Boolean = false,
    val color: Int = 0,
    val order: Int = 0,
    val dueDate: String? = null,      // a list "for a day": its undated tasks follow this date
)

@Serializable
data class Source(val label: String = "", val url: String = "")

@Serializable
data class RecurEnd(val type: String = "never", val date: String? = null, val count: Int? = null)

@Serializable
data class Recur(
    val freq: String = "none",        // none | day | week | month | year
    val n: Int = 1,
    val weekdays: List<Int> = emptyList(),   // 0 = Sunday ... 6 = Saturday
    val end: RecurEnd = RecurEnd(),
    val occ: Int = 1,
    val anchorDay: Int? = null,
)

@Serializable
data class Task(
    val id: String,
    val listId: String,
    val parentId: String? = null,
    val title: String = "",
    val notes: String = "",
    val isCompleted: Boolean = false,
    val completedAt: Long? = null,
    val isStarred: Boolean = false,
    val starredAt: Long? = null,
    val dueDate: String? = null,      // yyyy-MM-dd, local
    val dueTime: String? = null,      // HH:mm, local
    val source: Source? = null,
    val recur: Recur? = null,
    val order: Int = 0,
    val createdAt: Long = 0L,
    val presetId: String? = null,
    val presetItemId: String? = null,
    val spawnedNextId: String? = null,
)

@Serializable
data class PresetItem(
    val id: String,
    val parentId: String? = null,
    val title: String = "",
    val notes: String = "",
    val isStarred: Boolean = false,
    val time: String? = null,
    val order: Int = 0,
)

@Serializable
data class AutoCopy(
    val enabled: Boolean = false,
    val time: String = "06:00",
    val days: List<Int> = listOf(0, 1, 2, 3, 4, 5, 6),
)

@Serializable
data class Preset(
    val id: String,
    val name: String = "Preset",
    val targetListId: String? = null,
    val items: List<PresetItem> = emptyList(),
    val conflictMode: String = "skip",   // skip | fresh | append
    val auto: AutoCopy = AutoCopy(),
    val lastCopiedDate: String? = null,
)

@Serializable
data class Settings(
    val theme: String = "system",        // system | light | dark
    val view: String = "board",
    val calMode: String = "week",
    val compact: Boolean = false,
    val lastPresetId: String? = null,
    val reminders: Boolean = true,
)

/** What the web app writes when you export a backup. */
@Serializable
data class BackupFile(
    val app: String = "eommu",
    val version: Int = 1,
    val exportedAt: String = "",
    val data: AppState = AppState(),
)
