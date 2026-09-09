package expo.modules.healthaccess

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** Routes both Health Connect rationale entry points to the same in-app explanation. */
class HealthPermissionUsageActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val suffix = when {
      packageName.endsWith(".dev") -> "-dev"
      packageName.endsWith(".preview") -> "-preview"
      else -> ""
    }
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      startActivity(it.setAction(Intent.ACTION_VIEW)
        .setData(Uri.parse("cherrystudio$suffix://settings/permissions/health"))
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
    }
    finish()
  }
}
