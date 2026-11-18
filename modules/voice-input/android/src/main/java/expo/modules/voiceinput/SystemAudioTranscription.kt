package expo.modules.voiceinput

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.annotation.RequiresApi
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale

/** One on-device segmented file request. Main-thread ownership, one bounded PCM pipe writer. */
@RequiresApi(33)
internal class SystemAudioTranscription(
  val id: String,
  private val context: Context,
  private val complete: (Map<String, String>) -> Unit
) : RecognitionListener {
  private val main = Handler(Looper.getMainLooper())
  private val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
  private var source: ParcelFileDescriptor? = null
  private var sink: ParcelFileDescriptor.AutoCloseOutputStream? = null
  private var writer: Thread? = null
  @Volatile private var ended = false
  @Volatile private var inputComplete = false
  private var writerEnded = true
  private var started = false
  private var outcome: Map<String, String>? = null
  private val segments = mutableListOf<String>()
  private val timeout = Runnable { finish(mapOf("error" to "failed")) }

  companion object {
    fun available(context: Context): Boolean =
      Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    private fun intent(language: String) = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
    }

    private fun languageStatus(support: RecognitionSupport, language: String): String {
      val normalize = { value: String -> value.replace('_', '-').lowercase(Locale.ROOT) }
      return if (support.installedOnDeviceLanguages.any { normalize(it) == normalize(language) }) "ready" else "needs-setup"
    }

    fun status(context: Context, language: String, complete: (String) -> Unit) {
      if (!available(context)) { complete("unsupported"); return }
      val main = Handler(Looper.getMainLooper())
      val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      var ended = false
      lateinit var timeout: Runnable
      fun finish(status: String) {
        if (ended) return
        ended = true
        main.removeCallbacks(timeout)
        runCatching { recognizer.destroy() }
        complete(status)
      }
      timeout = Runnable { finish("unsupported") }
      main.postDelayed(timeout, 5000)
      try {
        recognizer.checkRecognitionSupport(intent(language), context.mainExecutor, object : RecognitionSupportCallback {
          override fun onSupportResult(support: RecognitionSupport) { finish(languageStatus(support, language)) }
          override fun onError(error: Int) { finish("unsupported") }
        })
      } catch (_: Exception) { finish("unsupported") }
    }
  }

  fun start(uri: String, language: String) {
    main.postDelayed(timeout, 60000)
    try {
      val url = Uri.parse(uri)
      require(url.scheme == "file")
      val file = File(requireNotNull(url.path)).canonicalFile
      // Only the module's own mono PCM16 window format enters this path.
      require(file.parentFile == File(context.cacheDir, "VoiceTranscription").canonicalFile)
      val header = ByteArray(44)
      RandomAccessFile(file, "r").use { it.readFully(header) }
      val format = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
      require(String(header, 0, 4) == "RIFF" && String(header, 8, 8) == "WAVEfmt " && String(header, 36, 4) == "data")
      require(format.getShort(20).toInt() == 1 && format.getShort(22).toInt() == 1 && format.getShort(34).toInt() == 16)
      val sampleRate = format.getInt(24)
      require(sampleRate in 1..192000 && file.length() > 44)
      val pipe = ParcelFileDescriptor.createPipe()
      source = pipe[0]
      sink = ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])
      val request = intent(language).apply {
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, source)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, sampleRate)
        putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
      }
      recognizer.setRecognitionListener(this)
      recognizer.checkRecognitionSupport(request, context.mainExecutor, object : RecognitionSupportCallback {
        override fun onSupportResult(support: RecognitionSupport) {
          if (ended || started) return
          if (languageStatus(support, language) != "ready") {
            finish(mapOf("error" to "offline-recognition-unavailable"))
            return
          }
          started = true
          try {
            recognizer.startListening(request)
            stream(file, sampleRate)
          } catch (_: SecurityException) { finish(mapOf("error" to "permission-denied")) }
          catch (_: Exception) { finish(mapOf("error" to "failed")) }
        }
        override fun onError(error: Int) {
          if (!started) finish(mapOf("error" to "unsupported"))
        }
      })
    } catch (_: Exception) { finish(mapOf("error" to "failed")) }
  }

  private fun stream(file: File, sampleRate: Int) {
    val output = requireNotNull(sink)
    writerEnded = false
    writer = Thread({
      var failure = false
      try {
        RandomAccessFile(file, "r").use { input ->
          input.seek(44)
          val buffer = ByteArray(4096)
          while (!ended) {
            val count = input.read(buffer)
            if (count < 0) { inputComplete = true; break }
            output.write(buffer, 0, count)
            Thread.sleep((count * 1000L / (sampleRate * 2L * 4)).coerceAtLeast(1))
          }
        }
      } catch (_: Exception) { failure = !ended }
      finally {
        runCatching { output.close() }
        main.post {
          writerEnded = true
          if (failure) finish(mapOf("error" to "failed"))
          settle()
        }
      }
    }, "CherryAudioTranscription").also { it.start() }
  }

  fun cancel() { finish(mapOf("error" to "failed")) }

  private fun finish(result: Map<String, String>) {
    if (ended) return
    ended = true
    outcome = result
    main.removeCallbacks(timeout)
    runCatching { recognizer.cancel() }
    runCatching { recognizer.destroy() }
    runCatching { source?.close() }
    runCatching { sink?.close() }
    writer?.interrupt()
    settle()
  }

  private fun settle() {
    if (!writerEnded) return
    val result = outcome ?: return
    outcome = null
    complete(result)
  }

  override fun onSegmentResults(results: Bundle) {
    if (!ended) results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { segments.add(it) }
  }
  override fun onEndOfSegmentedSession() {
    finish(if (inputComplete) mapOf("text" to segments.joinToString(" ")) else mapOf("error" to "unsupported"))
  }
  // A service ignoring segmented file input is not accepted as a completed file transcript.
  override fun onResults(results: Bundle) { finish(mapOf("error" to "unsupported")) }
  override fun onError(error: Int) {
    if (inputComplete && segments.isNotEmpty() &&
      (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
      finish(mapOf("text" to segments.joinToString(" ")))
      return
    }
    val code = when (error) {
      SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> if (inputComplete) "no-speech" else "unsupported"
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission-denied"
      SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE, SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "offline-recognition-unavailable"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
      else -> "failed"
    }
    finish(mapOf("error" to code))
  }
  override fun onReadyForSpeech(params: Bundle?) {}
  override fun onBeginningOfSpeech() {}
  override fun onRmsChanged(rmsdB: Float) {}
  override fun onBufferReceived(buffer: ByteArray?) {}
  override fun onEndOfSpeech() {}
  override fun onPartialResults(partialResults: Bundle?) {}
  override fun onEvent(eventType: Int, params: Bundle?) {}
}
