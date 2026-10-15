package expo.modules.diagnostics

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

  override fun definition() = ModuleDefinition {
    Name("CherryDiagnostics")

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

    OnDestroy { upload?.cancel() }
  }
}
