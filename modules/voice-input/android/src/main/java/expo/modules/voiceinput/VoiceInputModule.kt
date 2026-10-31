package expo.modules.voiceinput

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.sqrt

private const val SAMPLE_RATE = 16000
private const val MAX_SAMPLES = SAMPLE_RATE * 30

class VoiceInputModule : Module() {
  private val lock = Any()
  private var transcription: SystemAudioTranscription? = null
  private var capture: VoiceCapture? = null

  override fun definition() = ModuleDefinition {
    Name("VoiceInput")
    Events("finished", "level")

    AsyncFunction("modelDirectory") {
      val context = requireNotNull(appContext.reactContext)
      val directory = File(context.noBackupFilesDir, "VoiceModels")
      check(directory.isDirectory || directory.mkdirs()) { "Model storage unavailable" }
      Uri.fromFile(directory).toString() + "/"
    }

    AsyncFunction("decodeAudioChunk") { uri: String, start: Double, duration: Double ->
      AudioFileDecoder.decode(requireNotNull(appContext.reactContext).cacheDir, uri, start, duration)
    }

    AsyncFunction("systemTranscriptionStatus") { language: String, promise: Promise ->
      val context = requireNotNull(appContext.reactContext)
      if (Build.VERSION.SDK_INT < 33 || !SystemAudioTranscription.available(context)) {
        promise.resolve("unsupported")
      } else {
        SystemAudioTranscription.status(context, language) { promise.resolve(it) }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("transcribeAudioChunk") { id: String, uri: String, language: String, promise: Promise ->
      val context = requireNotNull(appContext.reactContext)
      if (Build.VERSION.SDK_INT < 33 || !SystemAudioTranscription.available(context)) {
        promise.resolve(mapOf("error" to "unsupported"))
      } else if (transcription != null) {
        promise.resolve(mapOf("error" to "busy"))
      } else {
        val next = SystemAudioTranscription(id, context) { result ->
          transcription = null
          promise.resolve(result)
        }
        transcription = next
        next.start(uri, language)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancelTranscription") { id: String ->
      if (transcription?.id == id) transcription?.cancel()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("start") { id: String ->
      synchronized(lock) {
        check(capture == null) { "Voice capture is busy" }
        val context = requireNotNull(appContext.reactContext)
        check(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
          "Microphone permission required"
        }
        val directory = File(context.cacheDir, "VoiceInput")
        check(directory.isDirectory || directory.mkdirs()) { "Recording storage unavailable" }
        directory.listFiles()?.forEach { it.delete() }
        val next = VoiceCapture(id, File(directory, "${UUID.randomUUID()}.wav")) { event, body ->
          if (event == "finished") synchronized(lock) {
            if (capture?.id == id) capture = null
          }
          sendEvent(event, body)
        }
        capture = next
        try { next.start() } catch (error: Exception) {
          capture = null
          next.cancel()
          throw error
        }
      }
    }

    AsyncFunction("stop") { id: String ->
      synchronized(lock) { capture?.takeIf { it.id == id } }?.stop()
    }
    AsyncFunction("cancel") { id: String ->
      synchronized(lock) { capture?.takeIf { it.id == id } }?.cancel()
    }
    OnActivityEntersBackground {
      synchronized(lock) { capture }?.interrupt()
    }
    OnDestroy {
      synchronized(lock) { capture }?.cancel()
      Handler(Looper.getMainLooper()).post { transcription?.cancel() }
    }
  }
}

/** Streams PCM to disk on one worker. Stop joins that writer before the WAV can be consumed. */
private class VoiceCapture(
  val id: String,
  private val file: File,
  private val emit: (String, Map<String, Any>) -> Unit
) {
  @Volatile private var running = true
  @Volatile private var cancelled = false
  @Volatile private var interrupted = false
  private var recorder: AudioRecord? = null
  private var worker: Thread? = null

  fun start() {
    val minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(minimum > 0) { "PCM recording is unavailable" }
    val audio = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum, 6400)
    )
    recorder = audio
    check(audio.state == AudioRecord.STATE_INITIALIZED) { "PCM recorder initialization failed" }
    audio.startRecording()
    check(audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Microphone did not start" }
    worker = Thread({ record(audio) }, "CherryVoiceInput").also { it.start() }
  }

  private fun record(audio: AudioRecord) {
    var failure: String? = null
    var samplesWritten = 0
    try {
      RandomAccessFile(file, "rw").use { output ->
        output.setLength(0)
        output.write(ByteArray(44))
        val samples = ShortArray(1600)
        val bytes = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        var lastLevel = 0L
        while (running && samplesWritten < MAX_SAMPLES) {
          val count = audio.read(samples, 0, minOf(samples.size, MAX_SAMPLES - samplesWritten))
          if (!running) break
          check(count > 0) { "Microphone read failed" }
          bytes.clear()
          var power = 0.0
          for (index in 0 until count) {
            bytes.putShort(samples[index])
            val value = samples[index].toDouble() / 32768.0
            power += value * value
          }
          output.write(bytes.array(), 0, count * 2)
          samplesWritten += count
          if (SystemClock.elapsedRealtime() - lastLevel >= 100) {
            lastLevel = SystemClock.elapsedRealtime()
            emit("level", mapOf("id" to id, "value" to sqrt(power / count)))
          }
        }
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(36 + samplesWritten * 2)
        header.put("WAVEfmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
        header.putInt(SAMPLE_RATE).putInt(SAMPLE_RATE * 2).putShort(2).putShort(16)
        header.put("data".toByteArray()).putInt(samplesWritten * 2)
        output.seek(0)
        output.write(header.array())
      }
    } catch (_: Exception) {
      failure = "recording-failed"
    } finally {
      running = false
      runCatching { audio.stop() }
      audio.release()
      recorder = null
      if (cancelled || interrupted || failure != null || samplesWritten == 0) {
        file.delete()
        emit("finished", mapOf("id" to id, "error" to (if (cancelled) "cancelled" else if (interrupted) "interrupted" else failure ?: "no-speech")))
      } else {
        emit("finished", mapOf("id" to id, "uri" to Uri.fromFile(file).toString()))
      }
    }
  }

  fun stop() {
    running = false
    runCatching { recorder?.stop() }
    worker?.join()
  }

  fun interrupt() {
    interrupted = true
    stop()
  }

  fun cancel() {
    cancelled = true
    stop()
    if (worker == null) {
      recorder?.release()
      recorder = null
    }
    file.delete()
  }
}
