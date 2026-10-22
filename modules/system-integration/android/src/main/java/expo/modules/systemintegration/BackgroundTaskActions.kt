package expo.modules.systemintegration

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import org.json.JSONArray
import org.json.JSONObject

/** A bounded native inbox covers delivery before the running JS listener is installed. */
internal object BackgroundTaskActions {
  private val listeners = mutableSetOf<() -> Unit>()

  @Synchronized fun observe(listener: () -> Unit): () -> Unit {
    listeners.add(listener)
    return { synchronized(this) { listeners.remove(listener) } }
  }

  @Synchronized fun receive(context: Context, intent: Intent) {
    val token = intent.getStringExtra("token") ?: return
    val actionId = intent.getStringExtra("actionId") ?: return
    val id = intent.getIntExtra("notificationId", -1)
    val notification = context.getSystemService(NotificationManager::class.java)
      .activeNotifications.firstOrNull { it.id == id }?.notification ?: return
    if (notification.extras.getString("actionToken") != token) return
    val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence("reply")?.toString()
    if (text != null && text.length > 4000) return
    val store = context.getSharedPreferences("background-task-actions", Context.MODE_PRIVATE)
    val pending = JSONArray(store.getString("pending", "[]"))
    val next = JSONArray()
    for (index in maxOf(0, pending.length() - 31) until pending.length()) next.put(pending.get(index))
    next.put(JSONObject().put("token", token).put("actionId", actionId).apply {
      if (text != null) put("text", text)
    })
    if (store.edit().putString("pending", next.toString()).commit()) listeners.toList().forEach { it() }
  }

  @Synchronized fun drain(context: Context): List<Map<String, String>> {
    val store = context.getSharedPreferences("background-task-actions", Context.MODE_PRIVATE)
    val pending = JSONArray(store.getString("pending", "[]"))
    if (!store.edit().remove("pending").commit()) return emptyList()
    return (0 until pending.length()).map { index ->
      val item = pending.getJSONObject(index)
      mutableMapOf("token" to item.getString("token"), "actionId" to item.getString("actionId")).apply {
        if (item.has("text")) put("text", item.getString("text"))
      }
    }
  }
}

class BackgroundTaskActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = BackgroundTaskActions.receive(context, intent)
}
