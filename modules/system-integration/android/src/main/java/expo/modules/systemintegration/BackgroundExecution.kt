package expo.modules.systemintegration

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat

/** Shares numeric notification identities with the foreground execution service. */
internal object BackgroundExecution {
  private const val OWNER = "cherry-background-activity"
  private const val RUNNING_CHANNEL = "RN_BACKGROUND_ACTIONS_CHANNEL"
  private const val ATTENTION_CHANNEL = "generation-updates"

  @Synchronized
  fun notificationId(context: Context, key: String): Int {
    val store = context.getSharedPreferences("background-task-notifications", Context.MODE_PRIVATE)
    if (store.contains(key)) return store.getInt(key, 0)
    val id = store.getInt("next-id", 100000)
    check(id < Int.MAX_VALUE) { "Notification identities exhausted" }
    check(store.edit().putInt(key, id).putInt("next-id", id + 1).commit())
    return id
  }

  fun settings(context: Context): Map<String, Any?> {
    val power = context.getSystemService(PowerManager::class.java)
    return mapOf(
      "batteryOptimizationExempt" to power.isIgnoringBatteryOptimizations(context.packageName),
      "lowPowerMode" to power.isPowerSaveMode,
      "liveActivitiesEnabled" to null,
      "manufacturer" to Build.MANUFACTURER
    )
  }

  fun openSettings(context: Context) {
    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try { context.startActivity(intent) }
    catch (_: Exception) {
      context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  fun show(context: Context, id: Int, title: String, body: String, url: String?, ongoing: Boolean, alert: Boolean, channelName: String) {
    val manager = context.getSystemService(NotificationManager::class.java)
    val channelId = if (alert) ATTENTION_CHANNEL else RUNNING_CHANNEL
    manager.createNotificationChannel(NotificationChannel(channelId, channelName,
      if (alert) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_LOW))
    val intent = if (url != null) Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(context.packageName)
      else context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.packageName)
    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val contentIntent = PendingIntent.getActivity(context, id, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val extras = Bundle().apply { putString("owner", OWNER); putBoolean("terminal", !ongoing) }
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    val notification = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(icon).setContentTitle(title).setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(contentIntent).setOngoing(ongoing).setAutoCancel(!ongoing)
      .setSilent(!alert).setOnlyAlertOnce(!alert)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).addExtras(extras)
      .build()
    manager.notify(id, notification)
  }

  fun dismiss(context: Context, id: Int) = context.getSystemService(NotificationManager::class.java).cancel(id)

  fun dismissCompleted(context: Context, key: String) {
    val store = context.getSharedPreferences("background-task-notifications", Context.MODE_PRIVATE)
    if (!store.contains(key)) return
    val id = store.getInt(key, 0)
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.activeNotifications.any { it.id == id && it.notification.extras.getBoolean("terminal") })
      manager.cancel(id)
  }

  fun clearOrphans(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    for (entry in manager.activeNotifications) {
      if (entry.notification.extras.getString("owner") == OWNER &&
          !entry.notification.extras.getBoolean("terminal")) manager.cancel(entry.id)
    }
  }
}
