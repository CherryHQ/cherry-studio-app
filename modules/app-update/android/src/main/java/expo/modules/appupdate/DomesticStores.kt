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

private val DEVICE_STORES = mapOf(
  "honor" to "honor",
  "xiaomi" to "xiaomi",
  "redmi" to "xiaomi",
  "poco" to "xiaomi",
  "oppo" to "oppo",
  "realme" to "oppo",
  "oneplus" to "oppo",
  "vivo" to "vivo",
  "iqoo" to "vivo",
)

internal class DomesticStores(private val context: Context) {
  @Suppress("DEPRECATION")
  fun resolve(): String? {
    val sources = runCatching {
      if (Build.VERSION.SDK_INT >= 30) {
        val info = context.packageManager.getInstallSourceInfo(context.packageName)
        val owner = if (Build.VERSION.SDK_INT >= 34) info.updateOwnerPackageName else null
        listOfNotNull(owner, info.installingPackageName)
      } else {
        listOfNotNull(context.packageManager.getInstallerPackageName(context.packageName))
      }
    }.getOrDefault(emptyList())
    return sources.firstNotNullOfOrNull { source ->
      STORE_PACKAGES.entries.firstOrNull { source in it.value }?.key
    } ?: listOf(Build.BRAND, Build.MANUFACTURER).firstNotNullOfOrNull { identity ->
      DEVICE_STORES[identity.trim().lowercase()]
    }
  }

  fun open(store: String) {
    require(STORE_PACKAGES.containsKey(store)) { "Unknown domestic store" }
    val packageName = requireNotNull(availablePackage(store)) { "The requested store is unavailable" }
    context.startActivity(intent(store, packageName))
  }

  @Suppress("DEPRECATION")
  private fun availablePackage(store: String): String? = STORE_PACKAGES[store]?.firstOrNull { packageName ->
    val activity = context.packageManager.resolveActivity(intent(store, packageName), PackageManager.MATCH_DEFAULT_ONLY)
    activity?.activityInfo?.let { it.enabled && it.exported && it.applicationInfo.enabled } == true
  }

  private fun intent(store: String, packageName: String): Intent {
    val uri = Uri.parse("market://details").buildUpon().appendQueryParameter("id", context.packageName)
    if (store == "vivo") {
      uri.appendQueryParameter("th_name", "self_update")
    }
    return Intent(Intent.ACTION_VIEW, uri.build()).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
  }
}
