package expo.modules.systemintegration

import android.app.Notification
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
import androidx.core.app.RemoteInput

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

  fun show(context: Context, id: Int, title: String, body: String, url: String?, ongoing: Boolean, alert: Boolean, channelName: String, actions: Map<String, Any?>?) {
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
    val group = remoteGroup(context, url)
    val isGroupSummary = group != null && actions?.get("groupSummary") == true
    // Android can omit a summary with only one child; validate actions against the visible card.
    val actionNotificationId = if (isGroupSummary) notificationId(context, connectionKey(id)) else id
    val extras = Bundle().apply {
      putString("owner", OWNER)
      putBoolean("terminal", !ongoing)
      if (group != null) putString("deviceGroup", group)
      if (ongoing && actions != null) putString("actionToken", actions["token"] as? String)
      if (Build.VERSION.SDK_INT >= 36) {
        // Android 16 QPR1's promotion request also works on compatible OEM surfaces.
        // API 36's initial SDK lacks the builder APIs; use the documented extras.
        val promoted = ongoing && actions?.get("promoted") != false && !isGroupSummary
        putBoolean("android.requestPromotedOngoing", promoted)
        if (promoted) putString("android.shortCriticalText", body.substringBefore('\n'))
      }
    }
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    val content = if (ongoing && actions != null && actions["promoted"] != false) listOf(body.substringBefore('\n'), actions["prompt"] as? String).filterNotNull().joinToString("\n") else body
    val builder = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(icon).setContentTitle(title).setContentText(content)
      .setStyle(NotificationCompat.BigTextStyle().bigText(content))
      .setContentIntent(contentIntent).setOngoing(ongoing).setAutoCancel(!ongoing)
      .setSilent(!alert).setOnlyAlertOnce(!alert)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).addExtras(extras)
    if (group != null) builder.setGroup(group).setGroupSummary(isGroupSummary)
      .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
    if (group != null && !isGroupSummary) builder.setSortKey("1_task")
    var replyAction: NotificationCompat.Action? = null
    if (ongoing && actions != null) {
      val token = actions["token"] as? String ?: ""
      @Suppress("UNCHECKED_CAST")
      val buttons = actions["buttons"] as? List<Map<String, String>> ?: emptyList()
      for (button in buttons.take(2)) {
        builder.addAction(NotificationCompat.Action.Builder(0, button["label"], actionIntent(context, actionNotificationId, token, button["id"] ?: "", false))
          .setAuthenticationRequired(true).build())
      }
      @Suppress("UNCHECKED_CAST")
      val reply = actions["reply"] as? Map<String, Any?>
      if (reply != null) {
        val input = RemoteInput.Builder("reply").setLabel(reply["placeholder"] as? String)
          .setChoices((reply["choices"] as? List<*>)?.filterIsInstance<String>()?.toTypedArray()).build()
        replyAction = NotificationCompat.Action.Builder(0, reply["label"] as? String, actionIntent(context, id, token, "reply", true))
          .addRemoteInput(input).setAllowGeneratedReplies(false).setAuthenticationRequired(true).build()
        if (Build.VERSION.SDK_INT < 36) builder.addAction(replyAction)
      }
    }
    val built = builder.build()
    // The group header aggregates content; expose disconnect only on the connection control card.
    val notification = built.apply { if (isGroupSummary) this.actions = null }
    if (isGroupSummary) regroupNotifications(context, group!!)
    manager.notify(id, notification)
    if (isGroupSummary) {
      // Android can hide summary content/actions when it renders nested children.
      // Keep the connection control first inside the group; the service owns the summary.
      manager.notify(notificationId(context, connectionKey(id)), builder
        .setGroupSummary(false).setSortKey("0_connection")
        .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY).build())
    }
    // Android 16 CDD 3.8.3.1/H-0-5 hides RemoteInput on promoted Live Updates.
    // Keep the status chip and offer text entry in a separate ordinary notice.
    if (Build.VERSION.SDK_INT >= 36 && replyAction != null) {
      val replyExtras = Bundle(extras).apply {
        putBoolean("android.requestPromotedOngoing", false)
        remove("android.shortCriticalText")
      }
      manager.notify(notificationId(context, replyKey(id)), builder.clearActions()
        .addAction(replyAction).setOngoing(false).setAutoCancel(false)
        .setSilent(true).setOnlyAlertOnce(true).addExtras(replyExtras).build())
    } else dismissReply(context, id)
  }

  private fun replyKey(id: Int) = "$OWNER:reply:$id"
  private fun connectionKey(id: Int) = "$OWNER:connection:$id"

  /** The backend's remote deep link supplies identity; local tasks never join a PC group. */
  private fun remoteGroup(context: Context, url: String?): String? {
    val uri = url?.let { Uri.parse(it) } ?: return null
    if (uri.host != "remote") return null
    val connectionId = uri.getQueryParameter("connectionId")?.takeIf { it.isNotBlank() } ?: return null
    return "${context.packageName}:remote:$connectionId"
  }

  private fun regroupNotifications(context: Context, group: String) {
    val manager = context.getSystemService(NotificationManager::class.java)
    for (entry in manager.activeNotifications) {
      val notification = entry.notification
      if (notification.extras.getString("owner") != OWNER ||
          notification.extras.getString("deviceGroup") != group ||
          notification.group == group || notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) continue
      manager.notify(entry.id, Notification.Builder.recoverBuilder(context, notification)
        .setGroup(group).setGroupAlertBehavior(Notification.GROUP_ALERT_SUMMARY)
        .setOnlyAlertOnce(true).build())
    }
  }

  /** Removing a summary can cancel its children; detach results before service teardown/handoff. */
  fun detachGroup(context: Context, id: Int) {
    val manager = context.getSystemService(NotificationManager::class.java)
    val summary = manager.activeNotifications.firstOrNull { it.id == id }?.notification
    if (summary != null && summary.flags and Notification.FLAG_GROUP_SUMMARY == 0) return
    val store = context.getSharedPreferences("background-task-notifications", Context.MODE_PRIVATE)
    val connectionId = store.getInt(connectionKey(id), -1)
    val control = manager.activeNotifications.firstOrNull { it.id == connectionId }?.notification
    val group = summary?.group ?: control?.group ?: return
    if (connectionId != -1) manager.cancel(connectionId)
    for (entry in manager.activeNotifications) {
      if (entry.id == id || entry.id == connectionId || entry.notification.group != group ||
          entry.notification.extras.getString("owner") != OWNER) continue
      manager.notify(entry.id, Notification.Builder.recoverBuilder(context, entry.notification)
        .setGroup(null).setOnlyAlertOnce(true).build())
    }
  }

  private fun dismissReply(context: Context, id: Int) {
    val store = context.getSharedPreferences("background-task-notifications", Context.MODE_PRIVATE)
    val key = replyKey(id)
    if (store.contains(key)) cancelNotification(context, store.getInt(key, 0))
  }

  private fun cancelNotification(context: Context, id: Int) {
    detachGroup(context, id)
    val manager = context.getSystemService(NotificationManager::class.java)
    val current = manager.activeNotifications.firstOrNull { it.id == id }?.notification
    if (current?.actions?.any { !it.remoteInputs.isNullOrEmpty() } == true) {
      // A direct reply can extend notification lifetime past cancel(). Updating
      // the same identity acknowledges it and removes obsolete reply controls.
      val retired = Notification.Builder.recoverBuilder(context, current)
        .setActions().setRemoteInputHistory(null).setOnlyAlertOnce(true)
        .setExtras(Bundle(current.extras).apply {
          remove("actionToken")
          putBoolean("terminal", true)
        }).build()
      manager.notify(id, retired)
    }
    manager.cancel(id)
  }

  private fun actionIntent(context: Context, id: Int, token: String, actionId: String, mutable: Boolean): PendingIntent {
    val intent = Intent(context, BackgroundTaskActionReceiver::class.java)
      .setData(Uri.Builder().scheme("cherry-background-action").authority(context.packageName).appendPath(token).appendPath(actionId).build())
      .putExtra("notificationId", id).putExtra("token", token).putExtra("actionId", actionId)
    return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or
      if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE)
  }

  fun dismiss(context: Context, id: Int) {
    dismissReply(context, id)
    cancelNotification(context, id)
  }

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
          !entry.notification.extras.getBoolean("terminal")) cancelNotification(context, entry.id)
    }
  }
}
