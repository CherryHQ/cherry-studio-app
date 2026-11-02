import AVFoundation

/** Reads one bounded window; source audio and microphone/session state are never changed. */
enum AudioFileDecoder {
  static func decode(uri: String, start: Double, duration: Double) throws -> [String: Any] {
    guard let source = URL(string: uri), source.isFileURL,
          start.isFinite, start >= 0, duration.isFinite, duration > 0, duration <= 30 else {
      throw DecoderError.invalidAudio
    }
    let input = try AVAudioFile(forReading: source, commonFormat: .pcmFormatFloat32, interleaved: false)
    let rate = input.processingFormat.sampleRate
    let channels = input.processingFormat.channelCount
    guard rate > 0, rate <= 192000, channels > 0, channels <= 32, input.length > 0 else {
      throw DecoderError.invalidAudio
    }
    let total = Double(input.length) / rate
    guard start < total else { throw DecoderError.invalidAudio }
    let first = AVAudioFramePosition((start * rate).rounded())
    let last = min(input.length, AVAudioFramePosition(((start + duration) * rate).rounded()))
    input.framePosition = first
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("VoiceTranscription")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    if start == 0 {
      for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
        try? FileManager.default.removeItem(at: file)
      }
    }
    let target = directory.appendingPathComponent("\(UUID().uuidString).wav")
    var completed = false
    defer { if !completed { try? FileManager.default.removeItem(at: target) } }
    guard let mono = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 1, interleaved: false),
          let sourceBuffer = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: 4096),
          let monoBuffer = AVAudioPCMBuffer(pcmFormat: mono, frameCapacity: 4096) else {
      throw DecoderError.invalidAudio
    }
    // AVAudioFile converts its float processing format into PCM16 on disk.
    let output = try AVAudioFile(forWriting: target, settings: [
      AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false
    ], commonFormat: .pcmFormatFloat32, interleaved: false)
    while input.framePosition < last {
      try input.read(into: sourceBuffer, frameCount: AVAudioFrameCount(min(4096, last - input.framePosition)))
      guard sourceBuffer.frameLength > 0,
            let sourceData = sourceBuffer.floatChannelData,
            let destination = monoBuffer.floatChannelData?[0] else { throw DecoderError.invalidAudio }
      monoBuffer.frameLength = sourceBuffer.frameLength
      for frame in 0..<Int(sourceBuffer.frameLength) {
        var sum: Float = 0
        for channel in 0..<Int(channels) { sum += sourceData[channel][frame] }
        destination[frame] = max(-1, min(1, sum / Float(channels)))
      }
      try output.write(from: monoBuffer)
    }
    completed = true
    return ["uri": target.absoluteString, "totalSeconds": total, "endSeconds": Double(last) / rate]
  }

  private enum DecoderError: Error { case invalidAudio }
}
