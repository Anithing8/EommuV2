package app.eommu.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.io.File
import java.time.Instant

/** One JSON file in the app's private storage, kept in memory as a StateFlow. */
class Store private constructor(private val file: File) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Any()
    private val _state = MutableStateFlow(load())
    val state: StateFlow<AppState> = _state.asStateFlow()

    private fun load(): AppState {
        val loaded = runCatching { if (file.exists()) json.decodeFromString<AppState>(file.readText()) else null }.getOrNull()
        val fresh = loaded ?: Logic.sample()
        return Logic.normalize(fresh)
    }

    /** Apply a change, repair the result, keep it in memory and write it to disk. */
    fun update(change: (AppState) -> AppState) {
        val next = synchronized(lock) {
            val n = Logic.normalize(change(_state.value))
            _state.value = n
            n
        }
        persist(next)
    }

    private fun persist(s: AppState) {
        scope.launch {
            synchronized(file) {
                runCatching {
                    val tmp = File(file.parentFile, file.name + ".tmp")
                    tmp.writeText(json.encodeToString(AppState.serializer(), s))
                    if (!tmp.renameTo(file)) { file.writeText(tmp.readText()); tmp.delete() }
                }
            }
            onSaved?.invoke(s)
        }
    }

    /** Called after every successful write (used to reschedule reminders). */
    var onSaved: ((AppState) -> Unit)? = null

    fun exportJson(): String =
        json.encodeToString(BackupFile.serializer(), BackupFile(exportedAt = Instant.now().toString(), data = _state.value))

    /** Accepts a backup from the web app or from this app. Throws a readable error otherwise. */
    fun importJson(text: String) {
        val data: AppState = try {
            val el = json.parseToJsonElement(text)
            val obj = (el as? kotlinx.serialization.json.JsonObject) ?: error("not an object")
            val inner = obj["data"] ?: obj
            json.decodeFromJsonElement(AppState.serializer(), inner)
        } catch (e: Exception) {
            throw IllegalArgumentException("This file is not an Eommu backup.")
        }
        require(data.lists.isNotEmpty() || data.tasks.isNotEmpty()) { "This backup is empty." }
        update { data }
    }

    companion object {
        val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; encodeDefaults = true; isLenient = true }

        @Volatile private var instance: Store? = null
        fun get(context: Context): Store = instance ?: synchronized(this) {
            instance ?: Store(File(context.applicationContext.filesDir, "eommu.json")).also { instance = it }
        }
    }
}
