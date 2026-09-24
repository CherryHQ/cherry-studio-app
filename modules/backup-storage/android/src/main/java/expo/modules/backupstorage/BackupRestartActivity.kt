package expo.modules.backupstorage

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Process

internal const val EXTRA_ORIGINAL_PROCESS_ID = "expo.modules.backupstorage.ORIGINAL_PROCESS_ID"

/** Reopens the app in a new native process so SQLite connections cannot survive the restore. */
class BackupRestartActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val originalProcessId = intent.getIntExtra(EXTRA_ORIGINAL_PROCESS_ID, -1)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (originalProcessId <= 0 || originalProcessId == Process.myPid() || launch == null) {
      finish()
      return
    }

    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    Process.killProcess(originalProcessId)
    startActivity(launch)
    finish()
    Process.killProcess(Process.myPid())
  }
}
