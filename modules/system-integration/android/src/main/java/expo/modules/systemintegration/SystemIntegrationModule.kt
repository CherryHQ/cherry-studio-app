package expo.modules.systemintegration

import android.content.Context
import android.content.Intent
import android.nfc.NfcAdapter
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** React Native reads this same Activity intent again when the JavaScript runtime restarts. */
internal fun consumeLaunchUrl(intent: Intent?, expected: String) {
  if (intent == null || intent.dataString != expected) return
  if (intent.action == Intent.ACTION_VIEW || intent.action == NfcAdapter.ACTION_NDEF_DISCOVERED) {
    intent.setDataAndType(null, intent.type)
  }
}

class SystemIntegrationModule : Module() {
  private val context: Context get() = requireNotNull(appContext.reactContext).applicationContext
  private var stopObserving: (() -> Unit)? = null
  private var stopActions: (() -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("SystemIntegration")
    Events("onPending", "onBackgroundTaskActionPending")
    OnCreate {
      stopObserving = SystemEntryStore.observe { sendEvent("onPending") }
      stopActions = BackgroundTaskActions.observe { sendEvent("onBackgroundTaskActionPending") }
    }
    OnDestroy { stopObserving?.invoke(); stopObserving = null; stopActions?.invoke(); stopActions = null }

    AsyncFunction("consumeLaunchUrl") Coroutine { expected: String ->
      withContext(Dispatchers.Main.immediate) { consumeLaunchUrl(appContext.currentActivity?.intent, expected) }
    }
    AsyncFunction("claimNextEntry") Coroutine { -> withContext(Dispatchers.IO) { SystemEntryStore.claimNext(context) } }
    AsyncFunction("releaseEntry") { id: String -> SystemEntryStore.release(id) }
    AsyncFunction("completeEntry") Coroutine { id: String -> withContext(Dispatchers.IO) { SystemEntryStore.complete(context, id) } }
    AsyncFunction("getBackgroundRunSettings") { BackgroundExecution.settings(context) }
    AsyncFunction("openBackgroundRunSettings") { BackgroundExecution.openSettings(context) }
    Function("getBackgroundTaskNotificationId") { key: String -> BackgroundExecution.notificationId(context, key) }
    AsyncFunction("showBackgroundTaskNotification") { id: Int, title: String, body: String, url: String?, ongoing: Boolean, alert: Boolean, channelName: String, options: Map<String, Any?>? ->
      BackgroundExecution.show(context, id, title, body, url, ongoing, alert, channelName, options)
    }
    AsyncFunction("drainBackgroundTaskActions") { BackgroundTaskActions.drain(context) }
    AsyncFunction("dismissBackgroundTaskNotification") { id: Int -> BackgroundExecution.dismiss(context, id) }
    AsyncFunction("dismissCompletedBackgroundTaskNotification") { key: String -> BackgroundExecution.dismissCompleted(context, key) }
    AsyncFunction("clearBackgroundTaskNotifications") { BackgroundExecution.clearOrphans(context) }
  }
}
