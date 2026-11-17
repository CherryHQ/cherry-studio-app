package expo.modules.systemintegration

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

internal object AppIcon {
  private val names = listOf("MainActivity", "EnterpriseLauncher")

  private fun components(context: Context) = names.map { ComponentName(context, "${context.packageName}.$it") }

  private fun isEnabled(manager: PackageManager, component: ComponentName): Boolean =
    when (manager.getComponentEnabledSetting(component)) {
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
      PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> manager.getActivityInfo(component, PackageManager.MATCH_DISABLED_COMPONENTS).enabled
      else -> false
    }

  fun state(context: Context): Map<String, Any?> {
    val manager = context.packageManager
    val allowsSwitching = manager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      .metaData?.getBoolean("expo.modules.systemintegration.APP_ICON_SWITCHING_ENABLED", false) == true
    val components = components(context)
    val configured = try {
      components.all {
        manager.getActivityInfo(it, PackageManager.MATCH_DISABLED_COMPONENTS).targetActivity ==
          "${context.packageName}.MainActivityHost"
      }
    } catch (_: PackageManager.NameNotFoundException) { false }
    val enabled = if (configured) components.map { isEnabled(manager, it) } else emptyList()
    val icon = when (enabled) {
      listOf(true, false) -> "community"
      listOf(false, true) -> "enterprise"
      else -> null
    }
    // Older Launcher3 versions delete pinned app entries instead of migrating a disabled alias.
    val supported = configured && allowsSwitching && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    return mapOf("isSupported" to supported, "icon" to icon)
  }

  fun set(context: Context, icon: String) {
    require(icon == "community" || icon == "enterprise") { "Unknown app icon" }
    check(state(context)["isSupported"] == true) { "App icon switching is unavailable" }
    val manager = context.packageManager
    val components = components(context)
    val selected = if (icon == "enterprise") 1 else 0
    val states = components.indices.map { index ->
      if (index == selected) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    }
    if (Build.VERSION.SDK_INT >= 33) {
      manager.setComponentEnabledSettings(components.indices.map { index ->
        PackageManager.ComponentEnabledSetting(components[index], states[index], PackageManager.DONT_KILL_APP)
      })
    } else {
      // MainActivityHost remains enabled for deep links, notifications and reloads.
      manager.setComponentEnabledSetting(components[selected], states[selected], PackageManager.DONT_KILL_APP)
      manager.setComponentEnabledSetting(components[1 - selected], states[1 - selected], PackageManager.DONT_KILL_APP)
    }
  }
}
