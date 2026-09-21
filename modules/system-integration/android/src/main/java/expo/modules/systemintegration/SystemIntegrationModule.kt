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
  }
}
