package expo.modules.managedstorage

import android.content.Context
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ManagedStorageModule : Module() {
  private val context: Context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("ManagedStorage")

    // Internal app-specific storage: private to the app and never evicted by the system.
    Function("getApplicationSupportDirectory") {
      Uri.fromFile(context.filesDir).toString().trimEnd('/') + "/"
    }
  }
}
