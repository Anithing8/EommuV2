package app.eommu.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Today
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.eommu.data.Logic
import app.eommu.data.Store

private data class NavTab(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EommuRoot(store: Store) {
    val s by store.state.collectAsStateWithLifecycle()
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val ui = remember(store) { Ui(store, snack, scope) }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var openId by rememberSaveable { mutableStateOf<String?>(null) }
    var settings by remember { mutableStateOf(false) }
    val tabs = remember {
        listOf(NavTab("Lists", Icons.Default.Checklist), NavTab("Today", Icons.Default.Today), NavTab("Calendar", Icons.Default.CalendarMonth), NavTab("Presets", Icons.Default.Layers))
    }

    EommuTheme(s.settings.theme) {
        // ask once for the notification permission on Android 13 and later
        val context = LocalContext.current
        val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
        LaunchedEffect(Unit) {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) ask.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        Scaffold(
            modifier = Modifier.imePadding(),
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                TopAppBar(
                    title = { Text(tabs[tab].label, style = MaterialTheme.typography.titleLarge) },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                    actions = { IconButton(onClick = { settings = true }) { Icon(Icons.Default.Settings, contentDescription = "Settings") } },
                )
            },
            bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    tabs.forEachIndexed { i, t ->
                        NavigationBarItem(selected = tab == i, onClick = { tab = i }, icon = { Icon(t.icon, contentDescription = null) }, label = { Text(t.label) })
                    }
                }
            },
            snackbarHost = { SnackbarHost(snack) },
        ) { pad ->
            Column(Modifier.padding(pad)) {
                when (tab) {
                    0 -> ListsScreen(s, ui) { openId = it }
                    1 -> TodayScreen(s, ui) { openId = it }
                    2 -> CalendarScreen(s, ui) { openId = it }
                    else -> PresetsScreen(s, ui)
                }
            }
        }

        openId?.let { id ->
            TaskSheet(s, id, onUpdate = { f -> store.update(f) }, onDelete = { ui.delete(it) }, onClose = { openId = null })
        }
        if (settings) SettingsSheet(s, store, ui) { settings = false }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSheet(s: app.eommu.data.AppState, store: Store, ui: Ui, onClose: () -> Unit) {
    val context = LocalContext.current
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.openOutputStream(uri)?.use { it.write(store.exportJson().toByteArray()) }
            }.onSuccess { ui.say("Backup saved.") }.onFailure { ui.say("The backup could not be saved.") }
        }
    }
    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: error("empty")
                store.importJson(text)
            }.onSuccess { ui.say("Backup imported.") }.onFailure { ui.say(it.message ?: "That file could not be imported.") }
        }
    }
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Theme", style = MaterialTheme.typography.titleMedium)
            listOf("system" to "Match the system", "light" to "Light", "dark" to "Dark").forEach { (v, label) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = s.settings.theme == v, onClick = { store.update { st -> st.copy(settings = st.settings.copy(theme = v)) } })
                    Text(label)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Reminders", style = MaterialTheme.typography.titleMedium)
                    Text("A notification at the clock time of a task.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = s.settings.reminders, onCheckedChange = { on -> store.update { st -> st.copy(settings = st.settings.copy(reminders = on)) } })
            }
            if (Build.VERSION.SDK_INT >= 31) {
                OutlinedButton(onClick = {
                    runCatching { context.startActivity(Intent(AndroidSettings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))) }
                }) { Text("Allow exact alarm times") }
            }
            Text("Backup", style = MaterialTheme.typography.titleMedium)
            Text("The file works in both directions with the Eommu web app.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { export.launch("eommu-backup-${Logic.todayStr()}.json") }) { Text("Export") }
                OutlinedButton(onClick = { importer.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }) { Text("Import") }
            }
            Text("Eommu 1.0 · github.com/Anithing8/EommuV2", color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(vertical = 12.dp))
        }
    }
}
