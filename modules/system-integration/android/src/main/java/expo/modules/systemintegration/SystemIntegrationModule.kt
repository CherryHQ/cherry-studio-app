package expo.modules.systemintegration

import android.content.Context
import android.os.Build
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
    Events("onPending", "onIntentCancelled")
    OnCreate { stopObserving = SystemEntryStore.observe { sendEvent("onPending") } }
    OnDestroy { stopObserving?.invoke(); stopObserving = null }

    Function("getCapabilities") {
      mapOf("translationWindow" to true, "translationProvider" to false, "translationShortcut" to false, "shortcuts" to (Build.VERSION.SDK_INT >= 25))
    }
    AsyncFunction("invalidateTranslationConfiguration") Coroutine { ->
      withContext(Dispatchers.IO) { TranslationConfigurationStore.invalidate(context) }
    }
    AsyncFunction("publishTranslationConfiguration") Coroutine { configuration: Map<String, Any?>, apiKey: String ->
      withContext(Dispatchers.IO) { TranslationConfigurationStore.publish(context, configuration, apiKey) }
    }
    AsyncFunction("publishTranslationUnavailable") Coroutine { configuration: Map<String, Any?> ->
      withContext(Dispatchers.IO) { TranslationConfigurationStore.publishUnavailable(context, configuration) }
    }
    AsyncFunction("getTranslationRevision") Coroutine { ->
      withContext(Dispatchers.IO) { TranslationConfigurationStore.revision(context) }
    }
    AsyncFunction("claimNextEntry") Coroutine { -> withContext(Dispatchers.IO) { SystemEntryStore.claimNext(context) } }
    AsyncFunction("releaseEntry") { id: String -> SystemEntryStore.release(id) }
    AsyncFunction("completeEntry") Coroutine { id: String -> withContext(Dispatchers.IO) { SystemEntryStore.complete(context, id) } }
    AsyncFunction("finishIntent") { _: String, _: Map<String, Any?> -> Unit }
    AsyncFunction("publishAgents") { _: List<Map<String, String>> -> Unit }
  }
}
