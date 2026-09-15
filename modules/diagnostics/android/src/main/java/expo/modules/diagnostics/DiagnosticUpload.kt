package expo.modules.diagnostics

import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

internal class DiagnosticUpload {
  @Volatile private var connection: HttpURLConnection? = null
  @Volatile private var cancelled = false

  fun cancel() {
    cancelled = true
    connection?.disconnect()
  }

  fun send(file: File, name: String, description: String, headers: Map<String, String>): Map<String, Any> {
    // Keep the same open archive across the digest check and transfer. A path
    // replacement cannot substitute a different file after signing.
    return file.inputStream().use { archive ->
      val hash = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(64 * 1024)
      var size = 0L
      var count = archive.read(buffer)
      while (count >= 0) {
        check(!cancelled) { "Diagnostic upload cancelled" }
        hash.update(buffer, 0, count)
        size += count
        count = archive.read(buffer)
      }
      val digest = hash.digest().joinToString("") { "%02x".format(it) }
      check(digest == headers["X-File-SHA256"] && size.toString() == headers["X-File-Size"]) {
        "Diagnostic archive changed"
      }
      archive.channel.position(0)
      transfer(archive, size, name, description, headers)
    }
  }

  private fun transfer(
    archive: FileInputStream,
    size: Long,
    name: String,
    description: String,
    headers: Map<String, String>
  ): Map<String, Any> {
    val boundary = "CherryDiagnostic${UUID.randomUUID()}"
    val safeName = name.replace(Regex("[\"\r\n]"), "_")
    val prefix = ("--$boundary\r\nContent-Disposition: form-data; name=\"description\"\r\n\r\n$description\r\n" +
      "--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$safeName\"\r\nContent-Type: application/zip\r\n\r\n")
      .toByteArray(Charsets.UTF_8)
    val suffix = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)
    val connection = URL("https://api.cherry-ai.com/diagnostics").openConnection() as HttpURLConnection
    this.connection = connection
    val timer = Executors.newSingleThreadScheduledExecutor()
    var status = 0
    try {
      check(!cancelled) { "Diagnostic upload cancelled" }
      connection.instanceFollowRedirects = false
      connection.requestMethod = "POST"
      connection.connectTimeout = 15 * 60 * 1000
      connection.readTimeout = 15 * 60 * 1000
      connection.doOutput = true
      headers.forEach { (key, value) -> connection.setRequestProperty(key, value) }
      connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      connection.setFixedLengthStreamingMode(prefix.size.toLong() + size + suffix.size)
      timer.schedule({ connection.disconnect() }, 15, TimeUnit.MINUTES)
      connection.outputStream.use { output ->
        output.write(prefix)
        archive.copyTo(output, 64 * 1024)
        output.write(suffix)
      }
      status = connection.responseCode
      if (status != 400 && status !in 200..299) {
        return mapOf("status" to status, "body" to "", "invalidResponse" to false)
      }
      val length = connection.getHeaderField("Content-Length")?.trim()
      if (length != null &&
        (!length.matches(Regex("[0-9]+")) || length.toLongOrNull() == null || length.toLong() > 64 * 1024)
      ) {
        return mapOf("status" to status, "body" to "", "invalidResponse" to true)
      }
      val input = if (status == 400) connection.errorStream else connection.inputStream
      val bytes = input?.use { it.readBytesBounded(64 * 1024) } ?: ByteArray(0)
      val decoder = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
      return mapOf("status" to status, "body" to decoder.decode(ByteBuffer.wrap(bytes)).toString(), "invalidResponse" to false)
    } catch (_: Exception) {
      return mapOf("status" to status, "body" to "", "invalidResponse" to true)
    } finally {
      connection.disconnect()
      timer.shutdownNow()
      this.connection = null
    }
  }
}

private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
  val result = java.io.ByteArrayOutputStream()
  val buffer = ByteArray(8192)
  var count = read(buffer)
  while (count >= 0) {
    check(result.size() + count <= limit) { "Diagnostic response exceeds limit" }
    result.write(buffer, 0, count)
    count = read(buffer)
  }
  return result.toByteArray()
}
