package app.eommu

import android.app.Application
import app.eommu.data.Store
import app.eommu.notify.Reminders

class EommuApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Reminders.createChannel(this)
        val store = Store.get(this)
        // every saved change refreshes the next reminder alarm
        store.onSaved = { s -> Reminders.fireDueAndSchedule(this, s) }
        Reminders.fireDueAndSchedule(this, store.state.value)
    }
}
