package expo.modules.systemintegration

import android.content.Context
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SystemIntegrationModule : Module() {
  private val context: Context get() = requireNotNull(appContext.reactContext).applicationContext
  private var stopObserving: (() -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("SystemIntegration")
    Events("onPending")
    OnCreate { stopObserving = SystemEntryStore.observe { sendEvent("onPending") } }
    OnDestroy { stopObserving?.invoke(); stopObserving = null }

    AsyncFunction("claimNextEntry") Coroutine { -> withContext(Dispatchers.IO) { SystemEntryStore.claimNext(context) } }
    AsyncFunction("releaseEntry") { id: String -> SystemEntryStore.release(id) }
    AsyncFunction("completeEntry") Coroutine { id: String -> withContext(Dispatchers.IO) { SystemEntryStore.complete(context, id) } }
    AsyncFunction("getBackgroundRunSettings") { BackgroundExecution.settings(context) }
    AsyncFunction("openBackgroundRunSettings") { BackgroundExecution.openSettings(context) }
    Function("getBackgroundTaskNotificationId") { key: String -> BackgroundExecution.notificationId(context, key) }
    AsyncFunction("showBackgroundTaskNotification") { id: Int, title: String, body: String, url: String?, ongoing: Boolean, alert: Boolean, channelName: String ->
      BackgroundExecution.show(context, id, title, body, url, ongoing, alert, channelName)
    }
    AsyncFunction("dismissBackgroundTaskNotification") { id: Int -> BackgroundExecution.dismiss(context, id) }
    AsyncFunction("dismissCompletedBackgroundTaskNotification") { key: String -> BackgroundExecution.dismissCompleted(context, key) }
    AsyncFunction("clearBackgroundTaskNotifications") { BackgroundExecution.clearOrphans(context) }
  }
}
