package expo.modules.voiceinput

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.SystemClock
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.ceil
import kotlin.math.roundToInt

/** Decodes a bounded window to mono PCM16. Large recordings are never loaded into memory. */
internal object AudioFileDecoder {
  fun decode(cache: File, uri: String, start: Double, duration: Double): Map<String, Any> {
    val source = Uri.parse(uri)
    require(source.scheme == "file" && start.isFinite() && start >= 0 && duration.isFinite() && duration > 0 && duration <= 30)
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    var target: File? = null
    var completed = false
    try {
      extractor.setDataSource(requireNotNull(source.path))
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: error("No audio track")
      var format = extractor.getTrackFormat(track)
      require(format.containsKey(MediaFormat.KEY_DURATION)) { "Audio duration unavailable" }
      val total = format.getLong(MediaFormat.KEY_DURATION) / 1_000_000.0
      require(total.isFinite() && total > start)
      val end = minOf(total, start + duration)
      val startUs = (start * 1_000_000).toLong()
      val endUs = (end * 1_000_000).toLong()
      extractor.selectTrack(track)
      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      val directory = File(cache, "VoiceTranscription")
      check(directory.isDirectory || directory.mkdirs())
      if (start == 0.0) directory.listFiles()?.forEach { it.delete() }
      val outputFile = File(directory, "${UUID.randomUUID()}.wav")
      target = outputFile
      RandomAccessFile(outputFile, "rw").use { output ->
        output.write(ByteArray(44))
        var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        var encoding = AudioFormat.ENCODING_PCM_16BIT
        var samplesWritten = 0
        fun updateFormat(next: MediaFormat) {
          val nextRate = next.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          require(samplesWritten == 0 || rate == nextRate) { "Audio sample rate changed" }
          rate = nextRate
          channels = next.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          encoding = if (next.containsKey(MediaFormat.KEY_PCM_ENCODING)) next.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
          require(rate in 1..192000 && channels in 1..32)
          require(encoding == AudioFormat.ENCODING_PCM_16BIT || encoding == AudioFormat.ENCODING_PCM_FLOAT) { "Unsupported PCM format" }
        }
        updateFormat(format)
        fun writePcm(buffer: ByteBuffer, timestamp: Long) {
          buffer.order(ByteOrder.LITTLE_ENDIAN)
          val bytesPerSample = if (encoding == AudioFormat.ENCODING_PCM_FLOAT) 4 else 2
          val stride = bytesPerSample * channels
          val frames = buffer.remaining() / stride
          val first = ceil((startUs - timestamp) * rate / 1_000_000.0).toInt().coerceIn(0, frames)
          val last = ceil((endUs - timestamp) * rate / 1_000_000.0).toInt().coerceIn(first, frames)
          val base = buffer.position()
          val bytes = ByteBuffer.allocate((last - first) * 2).order(ByteOrder.LITTLE_ENDIAN)
          for (frame in first until last) {
            var sum = 0.0
            for (channel in 0 until channels) {
              val offset = base + frame * stride + channel * bytesPerSample
              sum += if (encoding == AudioFormat.ENCODING_PCM_FLOAT) buffer.getFloat(offset).toDouble() else buffer.getShort(offset) / 32768.0
            }
            val value = (sum / channels).let { if (it.isFinite()) it.coerceIn(-1.0, 1.0) else 0.0 }
            bytes.putShort((value * 32767).roundToInt().toShort())
          }
          output.write(bytes.array())
          samplesWritten += last - first
        }
        val mime = requireNotNull(format.getString(MediaFormat.KEY_MIME))
        if (mime == "audio/raw") {
          val buffer = ByteBuffer.allocate(1024 * 1024)
          while (extractor.sampleTime >= 0 && extractor.sampleTime < endUs) {
            buffer.clear()
            val count = extractor.readSampleData(buffer, 0)
            if (count < 0) break
            require(count <= buffer.capacity())
            buffer.limit(count)
            writePcm(buffer, extractor.sampleTime)
            if (!extractor.advance()) break
          }
        } else {
          val decoder = MediaCodec.createDecoderByType(mime)
          codec = decoder
          decoder.configure(format, null, null, 0)
          decoder.start()
          var inputEnded = false
          var outputEnded = false
          var lastProgress = SystemClock.elapsedRealtime()
          val info = MediaCodec.BufferInfo()
          while (!outputEnded) {
            require(SystemClock.elapsedRealtime() - lastProgress < 10000) { "Audio decoder stalled" }
            if (!inputEnded) {
              val index = decoder.dequeueInputBuffer(10000)
              if (index >= 0) {
                val input = requireNotNull(decoder.getInputBuffer(index))
                input.clear()
                val timestamp = extractor.sampleTime
                val count = if (timestamp < 0 || timestamp > endUs + 1_000_000) -1 else extractor.readSampleData(input, 0)
                if (count < 0) {
                  decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                  inputEnded = true
                } else {
                  decoder.queueInputBuffer(index, 0, count, timestamp, 0)
                  extractor.advance()
                }
                lastProgress = SystemClock.elapsedRealtime()
              }
            }
            when (val index = decoder.dequeueOutputBuffer(info, 10000)) {
              MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                format = decoder.outputFormat
                updateFormat(format)
                lastProgress = SystemClock.elapsedRealtime()
              }
              else -> if (index >= 0) {
                try {
                  if (info.size > 0) {
                    val buffer = requireNotNull(decoder.getOutputBuffer(index))
                    buffer.position(info.offset)
                    buffer.limit(info.offset + info.size)
                    writePcm(buffer, info.presentationTimeUs)
                  }
                  outputEnded = info.presentationTimeUs >= endUs || (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0
                  lastProgress = SystemClock.elapsedRealtime()
                } finally { decoder.releaseOutputBuffer(index, false) }
              }
            }
          }
        }
        require(samplesWritten > 0) { "Empty audio window" }
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(36 + samplesWritten * 2)
        header.put("WAVEfmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
        header.putInt(rate).putInt(rate * 2).putShort(2).putShort(16)
        header.put("data".toByteArray()).putInt(samplesWritten * 2)
        output.seek(0)
        output.write(header.array())
      }
      completed = true
      return mapOf("uri" to Uri.fromFile(outputFile).toString(), "totalSeconds" to total, "endSeconds" to end)
    } finally {
      codec?.let { decoder ->
        runCatching { decoder.stop() }
        runCatching { decoder.release() }
      }
      runCatching { extractor.release() }
      if (!completed) target?.delete()
    }
  }
}
