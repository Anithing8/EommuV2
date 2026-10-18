# Eommu for Android

A native Kotlin app (Jetpack Compose, Material 3) with the same data format as the web app.

- Lists with an optional date ("a list for a day"); its tasks show on the calendar that day
- Tasks with two levels of subtasks, priority star, due date and time, repeat (days, weeks, months, years)
- Swipe a task to the left, past about half the row, to delete it. Undo is always offered
- New tasks always go to the end of their list
- Today and overdue with a progress bar, a day and week calendar, and presets you copy to today or tomorrow
- Reminders as notifications with a Mark done button; they are set again after a restart
- Light, dark or system theme; export and import a backup that also works with the web app

## Build

Open the `android` folder in Android Studio (Koala or newer) and press Run, or from a terminal:

```
./gradlew assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Without Android Studio, the
workflow `.github/workflows/android.yml` builds it on GitHub: open the **Actions** tab, run
**Build Android app**, and download the `Eommu-debug-apk` file from the finished run.

On Android 12 and later, allow **Exact alarm times** in the app's settings screen so a reminder
arrives at the minute you chose instead of a little later.
