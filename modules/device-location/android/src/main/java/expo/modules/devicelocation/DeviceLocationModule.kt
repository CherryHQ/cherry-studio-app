package expo.modules.devicelocation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private const val REQUEST_TIMEOUT_MS = 30_000L
private const val MAX_FIX_AGE_NS = 10_000_000_000L

class DeviceLocationModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val requests = ConcurrentHashMap<String, CancellationSignal>()

  override fun definition() = ModuleDefinition {
    Name("DeviceLocation")

    // Reserve synchronously so cancellation cannot overtake the queued async start.
    Function("createRequest") {
      val id = UUID.randomUUID().toString()
      requests[id] = CancellationSignal()
      id
    }

    AsyncFunction("getCurrentPosition") { id: String, promise: Promise ->
      val cancellation = requests[id]
      val context = appContext.reactContext
      when {
        cancellation == null -> promise.reject("E_LOCATION_CANCELLED", "Location request cancelled", null)
        context == null -> {
          requests.remove(id)
          promise.reject("E_LOCATION_UNAVAILABLE", "Android location context is unavailable", null)
        }
        else -> LocationRequest(id, context, cancellation, promise).start()
      }
    }.runOnQueue(Queues.MAIN)

    Function("cancelRequest") { id: String ->
      requests.remove(id)?.cancel()
    }

    OnDestroy {
      requests.values.forEach { it.cancel() }
      requests.clear()
    }
  }

  // All provider callbacks, deadlines, and cleanup run on the main looper.
  private inner class LocationRequest(
    private val id: String,
    private val context: Context,
    private val cancellation: CancellationSignal,
    private val promise: Promise,
  ) {
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    private val listeners = mutableMapOf<String, LocationListener>()
    private var settled = false
    private val timeout = Runnable {
      if (!hasPermission()) {
        fail("E_LOCATION_PERMISSION_DENIED", "Location permission was revoked during the request")
      } else {
        fail(
          "E_LOCATION_TIMEOUT",
          "Android system location returned no fresh fix within 30 seconds (providers: ${listeners.keys.joinToString()}). " +
            "This does not establish a permission failure. Check system location settings or move somewhere with a clearer sky view before trying again."
        )
      }
    }

    fun start() {
      cancellation.setOnCancelListener {
        handler.post { fail("E_LOCATION_CANCELLED", "Location request cancelled") }
      }
      if (cancellation.isCanceled) {
        fail("E_LOCATION_CANCELLED", "Location request cancelled")
        return
      }
      if (!hasPermission()) {
        fail("E_LOCATION_PERMISSION_DENIED", "Foreground location permission is denied")
        return
      }
      val locationManager = manager
      if (locationManager == null) {
        fail("E_LOCATION_UNAVAILABLE", "Android system location is unavailable")
        return
      }

      try {
        val providers = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
          .filter { locationManager.allProviders.contains(it) && locationManager.isProviderEnabled(it) }
        if (providers.isEmpty()) {
          fail("E_LOCATION_SERVICES_DISABLED", "No GPS or network location provider is enabled. Enable system location before trying again.")
          return
        }
        handler.postDelayed(timeout, REQUEST_TIMEOUT_MS)
        var registrationError: Exception? = null
        for (provider in providers) {
          val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
              if (settled || cancellation.isCanceled) return
              val age = SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos
              // Never pass a stale last-known position off as the current location.
              if (age !in 0..MAX_FIX_AGE_NS) return
              cleanup()
              promise.resolve(location.toResult())
            }

            override fun onProviderDisabled(provider: String) {
              if (settled) return
              listeners.remove(provider)?.let { removeListener(it) }
              if (listeners.isEmpty()) {
                fail("E_LOCATION_SERVICES_DISABLED", "The active system location providers were disabled during the request")
              }
            }

            override fun onProviderEnabled(provider: String) = Unit

            @Deprecated("Only used before Android Q")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
          }
          listeners[provider] = listener
          try {
            locationManager.requestLocationUpdates(provider, 1_000L, 0f, listener, Looper.getMainLooper())
          } catch (error: Exception) {
            listeners.remove(provider)
            removeListener(listener)
            registrationError = error
          }
        }
        if (listeners.isEmpty()) {
          val denied = registrationError is SecurityException
          fail(
            if (denied) "E_LOCATION_PERMISSION_DENIED" else "E_LOCATION_UNAVAILABLE",
            if (denied) "System location providers rejected the current location permission"
            else "Could not start Android system location providers"
          )
        }
      } catch (error: SecurityException) {
        fail("E_LOCATION_PERMISSION_DENIED", "System location access was denied")
      } catch (error: Exception) {
        fail("E_LOCATION_UNAVAILABLE", "Could not access Android system location providers")
      }
    }

    private fun hasPermission() =
      context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun fail(code: String, message: String) {
      if (settled) return
      cleanup()
      promise.reject(code, message, null)
    }

    private fun cleanup() {
      settled = true
      handler.removeCallbacks(timeout)
      cancellation.setOnCancelListener(null)
      listeners.values.forEach { removeListener(it) }
      listeners.clear()
      requests.remove(id)
    }

    private fun removeListener(listener: LocationListener) {
      try {
        manager?.removeUpdates(listener)
      } catch (_: SecurityException) {
        // Revoking permission also removes the OS registration.
      }
    }
  }
}

private fun Location.toResult(): Map<String, Any?> = mapOf(
  "coords" to mapOf(
    "latitude" to latitude,
    "longitude" to longitude,
    "accuracy" to if (hasAccuracy()) accuracy.toDouble() else null,
    "altitude" to if (hasAltitude()) altitude else null,
    "altitudeAccuracy" to if (Build.VERSION.SDK_INT >= 26 && hasVerticalAccuracy()) verticalAccuracyMeters.toDouble() else null,
    "heading" to if (hasBearing()) bearing.toDouble() else null,
    "speed" to if (hasSpeed()) speed.toDouble() else null,
  ),
  "provider" to provider,
  "timestamp" to time.toDouble(),
)
