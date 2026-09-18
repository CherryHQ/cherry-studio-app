package expo.modules.systemintegration

import android.app.Activity
import android.content.Intent
import android.os.Bundle

class ShortcutEntryActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null) {
      val kind = intent.getStringExtra("kind")
      if (kind == "chat.open" || kind == "painting.open") {
        SystemEntryStore.enqueueNavigation(kind)
        packageManager.getLaunchIntentForPackage(packageName)?.let {
          startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        }
      }
    }
    finish()
  }
}
