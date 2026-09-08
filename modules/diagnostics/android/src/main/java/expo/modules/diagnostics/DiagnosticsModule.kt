package expo.modules.diagnostics

import android.app.Activity
import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val SAVE_REQUEST = 48271
private const val SECRET_SUFFIX = "GvI6I5ZrEHcGOWjO5AKhJKGmnwwGfM62XKpWqkjhvzRU2NZIinM77aTGIqhqys0g"

class DiagnosticsModule : Module() {
  @Volatile private var pending: Pair<String, Promise>? = null
  @Volatile private var copying = false
  private val scope = CoroutineScope(Dispatchers.IO)
  @Volatile private var upload: DiagnosticUpload? = null

  override fun definition() = ModuleDefinition {
    Name("CherryDiagnostics")

    Function("identifyFile") { uri: String ->
      val stat = Os.stat(Uri.parse(uri).path!!)
      check(OsConstants.S_ISREG(stat.st_mode)) { "Diagnostic source is not a file" }
      mapOf("size" to stat.st_size.toDouble(), "modifiedAt" to File(Uri.parse(uri).path!!).lastModified().toDouble(),
        "fileKey" to "${stat.st_dev}:${stat.st_ino}")
    }

    Function("cancelOperations") {
      upload?.cancel()
      appContext.currentActivity?.runOnUiThread {
        appContext.currentActivity?.finishActivity(SAVE_REQUEST)
        // A copy already in progress owns its streams until it finishes.
        if (!copying) { pending?.second?.resolve(null); pending = null }
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

    Function("startCrashCapture") { directory: String ->
      val context = appContext.reactContext ?: return@Function
      val root = File(Uri.parse(directory).path!!).apply { mkdirs() }
      DiagnosticCrashCapture.start(root)
      // Android's persisted process-exit history survives native crashes and ANRs.
      // Querying it does not install a competing fatal-exception handler.
      scope.launch {
        if (Build.VERSION.SDK_INT >= 30) {
          val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
          runCatching {
            manager.getHistoricalProcessExitReasons(context.packageName, 0, 0)
              .filter { it.reason in listOf(ApplicationExitInfo.REASON_CRASH,
                ApplicationExitInfo.REASON_CRASH_NATIVE, ApplicationExitInfo.REASON_ANR) }
              .forEach { exit ->
                val file = File(root, "${exit.timestamp}-${exit.pid}.json")
                if (!file.exists()) {
                  file.writeText(JSONObject().put("timestamp", exit.timestamp)
                    .put("reason", exit.reason).put("description", exit.description)
                    .put("status", exit.status).put("process", exit.processName).toString())
                  file.setLastModified(exit.timestamp)
                }
              }
          }
        }
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

    AsyncFunction("saveFile") { uri: String, name: String, promise: Promise ->
      if (pending != null) { promise.reject("ERR_BUSY", "A document export is already open", null) }
      else {
        pending = uri to promise
        try {
          appContext.throwingActivity.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/zip"
            putExtra(Intent.EXTRA_TITLE, name)
          }, SAVE_REQUEST)
        } catch (error: Exception) {
          pending = null
          promise.reject("ERR_SAVE", "Unable to open document export", error)
        }
      }
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode == SAVE_REQUEST) {
        val request = pending
        val resolver = appContext.reactContext?.contentResolver
        if (request != null) {
          val destination = intent?.data
          if (resultCode != Activity.RESULT_OK || destination == null) {
            pending = null
            request.second.resolve(null)
          } else {
            copying = true
            scope.launch {
              try {
                val output = resolver?.openOutputStream(destination, "wt") ?: error("Cannot open destination")
                output.use { target ->
                  File(Uri.parse(request.first).path!!).inputStream().use { it.copyTo(target) }
                }
                request.second.resolve(destination.toString())
              } catch (error: Exception) {
                request.second.reject("ERR_SAVE", "Unable to write document", error)
              } finally {
                pending = null
                copying = false
              }
            }
          }
        }
      }
    }

    OnDestroy {
      upload?.cancel()
      pending?.second?.reject("ERR_DESTROYED", "Document export was interrupted", null)
      pending = null
      scope.cancel()
    }
  }
}
