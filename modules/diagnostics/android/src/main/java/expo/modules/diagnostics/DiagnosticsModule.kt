package expo.modules.diagnostics

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

private const val SECRET_SUFFIX = "GvI6I5ZrEHcGOWjO5AKhJKGmnwwGfM62XKpWqkjhvzRU2NZIinM77aTGIqhqys0g"

class DiagnosticsModule : Module() {
  @Volatile private var upload: DiagnosticUpload? = null
  private var observingMotion = false
  private var sensorManager: SensorManager? = null
  private val motionListener = object : SensorEventListener {
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    override fun onSensorChanged(event: SensorEvent) {
      sendEvent("onAcceleration", mapOf(
        "x" to event.values[0] / SensorManager.GRAVITY_EARTH,
        "y" to event.values[1] / SensorManager.GRAVITY_EARTH,
        "z" to event.values[2] / SensorManager.GRAVITY_EARTH,
        "timestamp" to event.timestamp / 1_000_000.0,
      ))
    }
  }

  private fun startMotion() {
    if (!observingMotion || sensorManager != null) return
    val manager = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
    val sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
    if (manager.registerListener(motionListener, sensor, 50_000)) sensorManager = manager
  }

  private fun stopMotion() {
    sensorManager?.unregisterListener(motionListener)
    sensorManager = null
  }

  override fun definition() = ModuleDefinition {
    Name("CherryDiagnostics")
    Constants("supportsShakeFeedback" to true)
    Events("onAcceleration")
    OnStartObserving("onAcceleration") {
      observingMotion = true
      startMotion()
    }
    OnStopObserving("onAcceleration") {
      observingMotion = false
      stopMotion()
    }
    OnActivityEntersForeground { startMotion() }
    OnActivityEntersBackground { stopMotion() }

    Function("identifyFile") { uri: String ->
      val stat = Os.stat(Uri.parse(uri).path!!)
      check(OsConstants.S_ISREG(stat.st_mode)) { "Diagnostic source is not a file" }
      mapOf("size" to stat.st_size.toDouble(), "modifiedAt" to File(Uri.parse(uri).path!!).lastModified().toDouble(),
        "fileKey" to "${stat.st_dev}:${stat.st_ino}")
    }

    Function("cancelOperations") { upload?.cancel() }

    Function("isUploadConfigured") {
      val context = appContext.reactContext
      if (context == null) false else {
        val id = context.resources.getIdentifier("cherry_ai_client_secret", "string", context.packageName)
        id != 0 && context.getString(id).isNotEmpty()
      }
    }

    AsyncFunction("upload") { uri: String, name: String, description: String, headers: Map<String, String>, promise: Promise ->
      val transfer = DiagnosticUpload()
      upload = transfer
      try {
        promise.resolve(transfer.send(File(Uri.parse(uri).path!!), name, description, headers))
      } catch (error: Exception) {
        promise.reject("ERR_UPLOAD_PREPARATION", "Unable to prepare diagnostic upload", error)
      }
    }

    AsyncFunction("sha256") { uri: String ->
      val hash = MessageDigest.getInstance("SHA-256")
      File(Uri.parse(uri).path!!).inputStream().use { input ->
        val buffer = ByteArray(64 * 1024)
        var count = input.read(buffer)
        while (count >= 0) { hash.update(buffer, 0, count); count = input.read(buffer) }
      }
      hash.digest().joinToString("") { "%02x".format(it) }
    }

    AsyncFunction("sign") { value: String ->
      val context = appContext.reactContext ?: error("No application context")
      val id = context.resources.getIdentifier("cherry_ai_client_secret", "string", context.packageName)
      val secret = if (id == 0) "" else context.getString(id)
      check(secret.isNotEmpty()) { "CherryAI client secret is not configured" }
      val hmac = Mac.getInstance("HmacSHA256")
      hmac.init(SecretKeySpec("$secret.$SECRET_SUFFIX".toByteArray(Charsets.UTF_8), "HmacSHA256"))
      hmac.doFinal(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    OnDestroy {
      observingMotion = false
      stopMotion()
      upload?.cancel()
    }
  }
}
