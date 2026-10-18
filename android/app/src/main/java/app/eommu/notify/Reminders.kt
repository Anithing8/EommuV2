package app.eommu.notify

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.eommu.MainActivity
import app.eommu.R
import app.eommu.data.AppState
import app.eommu.data.Logic
import app.eommu.data.Store
import java.time.LocalDateTime
import java.time.ZoneId

object Reminders {
    const val CHANNEL = "reminders"
    private const val PREFS = "eommu.notified"
    private const val REQ_NEXT = 4201

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHANNEL, "Task reminders", NotificationManager.IMPORTANCE_HIGH)
            ch.description = "A reminder at the clock time of a task"
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun key(id: String, date: String?, time: String?) = "$id|$date|$time"

    private fun notified(context: Context): MutableSet<String> =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet("keys", emptySet())!!.toMutableSet()

    private fun remember(context: Context, keys: Set<String>) {
        val recent = keys.toList().takeLast(300).toSet()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet("keys", recent).apply()
    }

    /** Fire everything that is due, then set one alarm for the next reminder. */
    fun fireDueAndSchedule(context: Context, state: AppState) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = nextIntent(context)
        am.cancel(pi)
        if (!state.settings.reminders) return
        val now = LocalDateTime.now()
        val seen = notified(context)
        var next: LocalDateTime? = null
        for ((task, at) in Logic.upcomingReminders(state, now)) {
            val k = key(task.id, task.dueDate, task.dueTime)
            if (!at.isAfter(now)) {
                if (k !in seen) { show(context, state, task.id); seen += k }
            } else if (next == null) {
                next = at
            }
        }
        remember(context, seen)
        if (next != null) {
            val whenMs = next.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pi)
        }
    }

    private fun nextIntent(context: Context): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java).setAction("app.eommu.REMIND")
        return PendingIntent.getBroadcast(context, REQ_NEXT, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun show(context: Context, state: AppState, taskId: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val t = Logic.task(state, taskId) ?: return
        val list = Logic.list(state, t.listId)
        val open = PendingIntent.getActivity(
            context, taskId.hashCode(), Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val done = PendingIntent.getBroadcast(
            context, taskId.hashCode() + 1,
            Intent(context, ActionReceiver::class.java).setAction("app.eommu.DONE").putExtra("taskId", taskId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(t.title.ifBlank { "Task reminder" })
            .setContentText(listOfNotNull(t.dueTime, list?.name).joinToString(" · "))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(open)
            .addAction(0, "Mark done", done)
            .build()
        try { NotificationManagerCompat.from(context).notify(taskId.hashCode(), n) } catch (e: SecurityException) { /* permission revoked */ }
    }
}

/** The one alarm: fires due reminders and sets the next alarm. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = Store.get(context)
        Reminders.createChannel(context)
        Reminders.fireDueAndSchedule(context, store.state.value)
    }
}

/** "Mark done" on a notification. */
class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("taskId") ?: return
        val store = Store.get(context)
        store.update { Logic.setCompleted(it, id, true) }
        NotificationManagerCompat.from(context).cancel(id.hashCode())
    }
}

/** Alarms are cleared by a reboot or an app update; set them again. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = Store.get(context)
        Reminders.createChannel(context)
        Reminders.fireDueAndSchedule(context, store.state.value)
    }
}
