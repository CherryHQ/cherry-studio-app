package expo.modules.appupdate

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

private val STORE_PACKAGES = mapOf(
  "honor" to listOf("com.hihonor.appmarket"),
  "xiaomi" to listOf("com.xiaomi.market"),
  "oppo" to listOf("com.heytap.market", "com.oppo.market"),
  "vivo" to listOf("com.bbk.appstore"),
)

internal class DomesticStores(private val context: Context) {
  @Suppress("DEPRECATION")
  fun info(): Map<String, Any?> {
    val sources = runCatching {
      if (Build.VERSION.SDK_INT >= 30) {
        val info = context.packageManager.getInstallSourceInfo(context.packageName)
        val owner = if (Build.VERSION.SDK_INT >= 34) info.updateOwnerPackageName else null
        listOfNotNull(owner, info.installingPackageName)
      } else {
        listOfNotNull(context.packageManager.getInstallerPackageName(context.packageName))
      }
    }.getOrDefault(emptyList())
    val available = STORE_PACKAGES.keys.filter { availablePackage(it) != null }
    return mapOf(
      "preferred" to sources.firstNotNullOfOrNull { source ->
        STORE_PACKAGES.entries.firstOrNull { it.key in available && source in it.value }?.key
      },
      "available" to available,
      "brand" to Build.BRAND,
      "manufacturer" to Build.MANUFACTURER,
    )
  }

  fun open(store: String, grayApkId: String?) {
    require(STORE_PACKAGES.containsKey(store)) { "Unknown domestic store" }
    require(grayApkId == null || (store == "vivo" && grayApkId.matches(Regex("[0-9]+")))) { "Invalid vivo update target" }
    val packageName = requireNotNull(availablePackage(store)) { "The requested store is unavailable" }
    context.startActivity(intent(store, packageName, grayApkId))
  }

  @Suppress("DEPRECATION")
  private fun availablePackage(store: String): String? = STORE_PACKAGES[store]?.firstOrNull { packageName ->
    val activity = context.packageManager.resolveActivity(intent(store, packageName), PackageManager.MATCH_DEFAULT_ONLY)
    activity?.activityInfo?.let { it.enabled && it.exported && it.applicationInfo.enabled } == true
  }

  private fun intent(store: String, packageName: String, grayApkId: String? = null): Intent {
    val uri = Uri.parse("market://details").buildUpon().appendQueryParameter("id", context.packageName)
    if (store == "vivo") {
      uri.appendQueryParameter("th_name", "self_update")
      if (grayApkId != null) uri.appendQueryParameter("gray_apk_id", grayApkId)
    }
    return Intent(Intent.ACTION_VIEW, uri.build()).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
  }
}
