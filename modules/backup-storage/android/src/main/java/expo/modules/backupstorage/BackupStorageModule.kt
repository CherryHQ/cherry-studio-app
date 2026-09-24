package expo.modules.backupstorage

import android.content.Intent
import android.net.Uri
import android.os.Process
import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID

private val backupProcessId = UUID.randomUUID().toString()
private val controlLock = Any()

class BackupStorageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BackupStorage")
    Function("processId") { backupProcessId }
    AsyncFunction("restartAfterRestore") {
      val context = requireNotNull(appContext.reactContext).applicationContext
      check(context.packageManager.getLaunchIntentForPackage(context.packageName) != null) {
        "Could not find the app launch activity"
      }
      context.startActivity(
        Intent(context, BackupRestartActivity::class.java)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          .putExtra(EXTRA_ORIGINAL_PROCESS_ID, Process.myPid())
      )
    }
    Function("readControl") { documentUri: String ->
      synchronized(controlLock) {
        val file = controlFile(documentUri)
        if (!file.exists()) null else {
          require(file.length() <= 16384) { "Invalid storage control record" }
          file.readText(Charsets.UTF_8)
        }
      }
    }
    Function("writeControl") { documentUri: String, value: String ->
      synchronized(controlLock) {
        val bytes = value.toByteArray(Charsets.UTF_8)
        require(bytes.size <= 16384) { "Invalid storage control record" }
        val file = controlFile(documentUri)
        val parent = requireNotNull(file.parentFile)
        check(parent.isDirectory || parent.mkdirs()) { "Could not create control directory" }
        val temporary = File(parent, "state.tmp")
        FileOutputStream(temporary).use { stream ->
          stream.write(bytes)
          stream.fd.sync()
        }
        Os.rename(temporary.path, file.path)
        flush(parent)
        flush(requireNotNull(parent.parentFile))
      }
    }
    AsyncFunction("hashFile") { uri: String ->
      val digest = MessageDigest.getInstance("SHA-256")
      privateFile(uri).inputStream().buffered().use { stream ->
        val bytes = ByteArray(262144)
        while (true) {
          val size = stream.read(bytes)
          if (size < 0) break
          digest.update(bytes, 0, size)
        }
      }
      digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
    AsyncFunction("sealDirectory") { uri: String ->
      val root = privateFile(uri)
      seal(root)
      flush(requireNotNull(root.parentFile))
    }
  }

  private fun controlFile(documentUri: String) = File(privateFile(documentUri), "storage-control/state.json")

  private fun privateFile(uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Expected a private file URL" }
    val file = File(requireNotNull(parsed.path)).absoluteFile
    val context = requireNotNull(appContext.reactContext)
    val root = File(context.applicationInfo.dataDir).canonicalPath + File.separator
    require(file.canonicalPath.startsWith(root)) {
      "Path is outside private storage or contains a symlink"
    }
    return file.canonicalFile
  }

  private fun seal(file: File) {
    require(file.absolutePath == file.canonicalPath) { "Symlinks are not supported" }
    if (file.isDirectory) {
      val children = requireNotNull(file.listFiles()) { "Could not list storage directory" }
      children.forEach { seal(it) }
    } else {
      require(file.isFile) { "Unsupported storage entry" }
    }
    flush(file)
  }

  private fun flush(file: File) {
    val descriptor = Os.open(file.path, OsConstants.O_RDONLY, 0)
    try { Os.fsync(descriptor) } finally { Os.close(descriptor) }
  }
}
