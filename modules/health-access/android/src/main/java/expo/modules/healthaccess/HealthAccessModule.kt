package expo.modules.healthaccess

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.Serializable
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

private const val PROVIDER = "com.google.android.apps.healthdata"

class HealthAccessModule : Module() {
  private val context: Context get() = requireNotNull(appContext.reactContext)
  private val history get() = context.getSharedPreferences("cherry.health.requests", Context.MODE_PRIVATE)
  private val requestMutex = Mutex()
  private lateinit var launcher: AppContextActivityResultLauncher<HealthPermissionRequest, HealthPermissionResult>

  override fun definition() = ModuleDefinition {
    Name("HealthAccess")

    RegisterActivityContracts {
      launcher = registerForActivityResult(HealthPermissionContract()) { input, result ->
        recordRequest(input.types, result.granted.toSet())
      }
    }

    AsyncFunction("getAvailability") { availability() }

    AsyncFunction("getStatuses") Coroutine { types: List<String> -> getStatuses(types) }

    AsyncFunction("request") Coroutine { types: List<String> ->
      requestMutex.withLock {
        check(availability() == "available") { "Health Connect is not available" }
        val current = getStatuses(types)
        val requested = types.distinct().filter { current[it]?.get("canAskAgain") == true }
        if (requested.isNotEmpty()) {
          val granted = if (Build.VERSION.SDK_INT >= 34) {
            // Android 14+ returns runtime permission callbacks, not activity results.
            // Expo's activity-result registry does not forward that callback path.
            withContext(Dispatchers.Main) {
              suspendCancellableCoroutine<Unit> { continuation ->
                requireNotNull(appContext.permissions).askForPermissions(
                  PermissionsResponseListener {
                    if (continuation.isActive) continuation.resume(Unit)
                  },
                  *requested.map(::readPermission).toTypedArray()
                )
              }
            }
            HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
          } else {
            launcher.launch(HealthPermissionRequest(ArrayList(requested))).granted.toSet()
          }
          recordRequest(requested, granted)
        }
        getStatuses(types)
      }
    }

    AsyncFunction("openSettings") {
      val intent = when (availability()) {
        "install-required" -> {
          val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER"))
            .setPackage("com.android.vending")
          if (market.resolveActivity(context.packageManager) != null) market
          else Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER"))
        }
        "available" -> {
          // The per-app permission-management activity can require privileged
          // GRANT_RUNTIME_PERMISSIONS. Use the SDK's public settings entry point.
          Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).apply {
            if (Build.VERSION.SDK_INT < 34) setPackage(PROVIDER)
          }
        }
        else -> error("Health Connect is not supported on this device")
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private fun availability(): String = when {
    Build.VERSION.SDK_INT < 28 -> "unsupported"
    else -> when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "install-required"
      else -> "unsupported"
    }
  }

  private suspend fun getStatuses(types: List<String>): Map<String, Map<String, Any>> {
    check(availability() == "available") { "Health Connect is not available" }
    val granted = HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
    return types.associateWith { type ->
      val allowed = granted.contains(readPermission(type))
      val asked = history.getBoolean("$type.asked", false)
      mapOf(
        "state" to if (allowed) "granted" else if (asked) "denied" else "undetermined",
        "canAskAgain" to (!allowed && history.getInt("$type.denials", 0) < 2)
      )
    }
  }

  // This records requests, not grants. Grants are always reread from Health Connect.
  private fun recordRequest(types: List<String>, granted: Set<String>) {
    val editor = history.edit()
    for (type in types) {
      editor.putBoolean("$type.asked", true)
      editor.putInt("$type.denials", if (granted.contains(readPermission(type))) 0 else history.getInt("$type.denials", 0) + 1)
    }
    editor.apply()
  }
}

private data class HealthPermissionRequest(val types: ArrayList<String>) : Serializable
private data class HealthPermissionResult(val granted: ArrayList<String>) : Serializable

private class HealthPermissionContract : AppContextActivityResultContract<HealthPermissionRequest, HealthPermissionResult> {
  private val contract = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: HealthPermissionRequest): Intent =
    contract.createIntent(context, input.types.map(::readPermission).toSet())

  override fun parseResult(input: HealthPermissionRequest, resultCode: Int, intent: Intent?): HealthPermissionResult =
    HealthPermissionResult(ArrayList(contract.parseResult(resultCode, intent)))
}

private fun readPermission(type: String): String = HealthPermission.getReadPermission(
  when (type) {
    "steps" -> StepsRecord::class
    "activeEnergy" -> ActiveCaloriesBurnedRecord::class
    "distance" -> DistanceRecord::class
    "heartRate" -> HeartRateRecord::class
    "restingHeartRate" -> RestingHeartRateRecord::class
    "hrv" -> HeartRateVariabilityRmssdRecord::class
    "sleep" -> SleepSessionRecord::class
    "workouts" -> ExerciseSessionRecord::class
    else -> error("Unsupported health data type: $type")
  }
)
