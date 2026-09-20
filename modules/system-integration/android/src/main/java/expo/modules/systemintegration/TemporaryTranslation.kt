package expo.modules.systemintegration

import android.content.Context
import java.io.ByteArrayOutputStream
import java.net.SocketTimeoutException
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.HttpsURLConnection
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject

internal object TemporaryTranslation {
  private val executor = Executors.newFixedThreadPool(2)
  val languagePattern = Regex("^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$")

  suspend fun translate(context: Context, text: String, language: String): String {
    if (text.isBlank() || !languagePattern.matches(language)) throw TranslationFailure("invalidInput")
    if (text.length > 16_000) throw TranslationFailure("inputTooLarge")
    val configuration = TranslationConfigurationStore.read(context)
    try {
      return withTimeout(45_000) {
        coroutineScope {
          val watcher = launch(Dispatchers.IO) {
            while (true) {
              delay(400)
              if (TranslationConfigurationStore.revision(context) != configuration.revision) {
                throw TranslationFailure("configurationStale")
              }
            }
          }
          try {
            val result = request(configuration, text, language)
            if (TranslationConfigurationStore.revision(context) != configuration.revision) throw TranslationFailure("configurationStale")
            result
          } finally { watcher.cancel() }
        }
      }
    } catch (_: TimeoutCancellationException) {
      throw TranslationFailure("timedOut")
    }
  }

  private suspend fun request(configuration: TranslationConfiguration, text: String, language: String): String =
    suspendCancellableCoroutine { continuation ->
      val connection = URL(configuration.endpoint).openConnection() as HttpsURLConnection
      val future = AtomicReference<Future<*>?>()
      continuation.invokeOnCancellation { connection.disconnect(); future.get()?.cancel(true) }
      val scheduled = executor.submit {
        try {
          if (!continuation.isActive) return@submit
          connection.apply {
            requestMethod = "POST"
            instanceFollowRedirects = false
            useCaches = false
            connectTimeout = 15_000
            readTimeout = 45_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer ${configuration.apiKey}")
            setRequestProperty("Cache-Control", "no-store")
            setRequestProperty("User-Agent", "CherryStudioMobile/1.0")
          }
          val prompt = Regex("""\{\{(?:target_language|text)\}\}""").replace(configuration.promptTemplate) {
            if (it.value == "{{target_language}}") language else text
          }
          val body = configuration.requestParameters
            .put("model", configuration.wireModelId)
            .put("stream", false)
            .put("messages", JSONArray()
              .put(JSONObject().put("role", "user").put("content", prompt)))
          connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
          val status = connection.responseCode
          if (status != 200) throw TranslationFailure(when (status) {
            401, 403 -> "authenticationFailed"
            429 -> "rateLimited"
            408, 504 -> "timedOut"
            else -> "failed"
          })
          if (connection.contentLengthLong > 524_288) throw TranslationFailure("invalidResult")
          val bytes = ByteArrayOutputStream()
          connection.inputStream.use { stream ->
            val buffer = ByteArray(8_192)
            while (true) {
              if (!continuation.isActive) throw CancellationException()
              val count = stream.read(buffer)
              if (count < 0) break
              if (bytes.size() + count > 524_288) throw TranslationFailure("invalidResult")
              bytes.write(buffer, 0, count)
            }
          }
          val choice = JSONObject(bytes.toString("UTF-8")).getJSONArray("choices").getJSONObject(0)
          val message = choice.getJSONObject("message")
          val result = message.opt("content") as? String
          if (choice.optString("finish_reason") != "stop" || result.isNullOrBlank() || result.length > 64_000 ||
            (message.optJSONArray("tool_calls")?.length() ?: 0) > 0 ||
            (message.opt("refusal") as? String)?.isNotBlank() == true) {
            throw TranslationFailure("invalidResult")
          }
          if (continuation.isActive) continuation.resume(result)
        } catch (error: Exception) {
          val failure = when (error) {
            is TranslationFailure -> error
            is SocketTimeoutException -> TranslationFailure("timedOut")
            is org.json.JSONException -> TranslationFailure("invalidResult")
            else -> TranslationFailure("networkUnavailable")
          }
          if (continuation.isActive) continuation.resumeWithException(failure)
        } finally {
          connection.disconnect()
        }
      }
      // The connection cancellation above interrupts reads; do not retain request text in queued work.
      future.set(scheduled)
      if (!continuation.isActive) scheduled.cancel(true)
    }
}
