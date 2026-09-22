package expo.modules.systemintegration

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.AtomicFile
import java.io.File
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/** Explicitly accepted shares may survive a process restart. */
internal object SystemEntryStore {
  private val lock = Any()
  private val claimed = mutableSetOf<String>()
  private val listeners = mutableSetOf<() -> Unit>()
  private const val TTL_MS = 24 * 60 * 60 * 1000L
  private const val MAX_FILE_BYTES = 25 * 1024 * 1024L
  private const val MAX_TOTAL_BYTES = 50 * 1024 * 1024L

  fun observe(listener: () -> Unit): () -> Unit = synchronized(lock) {
    listeners.add(listener)
    return@synchronized { synchronized(lock) { listeners.remove(listener) }; Unit }
  }

  fun stageShare(context: Context, text: String, uris: List<Uri>, isCancelled: () -> Boolean): String {
    require(text.length <= 131_072 && uris.size <= 10)
    require(text.isNotBlank() || uris.isNotEmpty())
    val id = UUID.randomUUID().toString()
    val directory = File(entries(context), id).apply { mkdirs() }
    try {
      val files = JSONArray()
      var total = 0L
      for (uri in uris) {
        if (isCancelled()) throw InterruptedException()
        require(uri.scheme == "content")
        var name = "attachment"
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) name = cursor.getString(0)?.take(255) ?: name
        }
        name = name.substringAfterLast('/').substringAfterLast('\\').ifBlank { "attachment" }
        val file = File(directory, UUID.randomUUID().toString())
        var count = 0L
        requireNotNull(context.contentResolver.openInputStream(uri)).use { input ->
          file.outputStream().use { output ->
            val buffer = ByteArray(32_768)
            while (true) {
              if (isCancelled()) throw InterruptedException()
              val size = input.read(buffer)
              if (size < 0) break
              count += size
              total += size
              require(count <= MAX_FILE_BYTES && total <= MAX_TOTAL_BYTES)
              output.write(buffer, 0, size)
            }
          }
        }
        files.put(JSONObject().put("name", name).put("uri", Uri.fromFile(file).toString())
          .put("mediaType", context.contentResolver.getType(uri) ?: "application/octet-stream").put("size", count))
      }
      if (isCancelled()) throw InterruptedException()
      val value = JSONObject().put("version", 1).put("id", id).put("createdAt", System.currentTimeMillis())
        .put("kind", "share.receive").put("text", text).put("files", files)
      synchronized(lock) { write(File(directory, "entry.json"), value) }
      notifyPending()
      return id
    } catch (error: Exception) {
      directory.deleteRecursively()
      throw error
    }
  }

  fun claimNext(context: Context): Map<String, Any?>? = synchronized(lock) {
    cleanExpired(context)
    val queued = entries(context).listFiles()?.filter { it.isDirectory }?.sortedBy { it.lastModified() }
      ?.firstNotNullOfOrNull { directory ->
        if (claimed.contains(directory.name)) null else readEntry(directory)
      }
    if (queued == null) return@synchronized null
    claimed.add(queued.getString("id"))
    queued.toMap()
  }

  fun release(id: String) = synchronized(lock) { claimed.remove(id); Unit }

  fun complete(context: Context, id: String) = synchronized(lock) {
    requireIdentifier(id)
    claimed.remove(id)
    File(entries(context), id).deleteRecursively()
    Unit
  }

  private fun entries(context: Context): File =
    File(root(context), "shares").apply { mkdirs() }

  private fun root(context: Context): File =
    File(context.noBackupFilesDir, "cherry-system-integration").apply { mkdirs() }

  private fun readEntry(directory: File): JSONObject? {
    val file = File(directory, "entry.json")
    // Account for UTF-8 and JSON escaping within the 131,072 UTF-16-unit input limit.
    if (!file.exists() || file.length() > 1_048_576) return null
    return try {
      val value = JSONObject(file.readText())
      require(value.optInt("version") == 1 && value.optString("id") == directory.name && value.optString("kind") == "share.receive")
      val files = value.optJSONArray("files") ?: JSONArray()
      require(files.length() <= 10)
      for (index in 0 until files.length()) {
        val uri = Uri.parse(files.getJSONObject(index).getString("uri"))
        require(uri.scheme == "file")
        val attachment = File(requireNotNull(uri.path)).canonicalFile
        require(attachment.parentFile == directory.canonicalFile && attachment.isFile && attachment.length() <= MAX_FILE_BYTES)
      }
      value
    } catch (_: Exception) {
      directory.deleteRecursively()
      null
    }
  }

  private fun cleanExpired(context: Context) {
    val now = System.currentTimeMillis()
    entries(context).listFiles()?.forEach { directory ->
      if (directory.isDirectory && !claimed.contains(directory.name)) {
        val createdAt = readEntry(directory)?.optLong("createdAt") ?: directory.lastModified()
        if (createdAt <= 0 || now - createdAt > TTL_MS || createdAt > now + 60_000) directory.deleteRecursively()
      }
    }
  }

  private fun requireIdentifier(id: String) { require(runCatching { UUID.fromString(id) }.isSuccess) }

  private fun write(file: File, value: JSONObject) {
    val atomic = AtomicFile(file)
    val output = atomic.startWrite()
    try { output.write(value.toString().toByteArray(Charsets.UTF_8)); atomic.finishWrite(output) }
    catch (error: Exception) { atomic.failWrite(output); throw error }
  }

  private fun notifyPending() { synchronized(lock) { listeners.toList() }.forEach { it() } }
}

internal fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key ->
  when (val value = get(key)) {
    JSONObject.NULL -> null
    is JSONObject -> value.toMap()
    is JSONArray -> (0 until value.length()).map { index ->
      val item = value.get(index)
      if (item is JSONObject) item.toMap() else item
    }
    else -> value
  }
}
