import AVFoundation
import ExpoModulesCore
import UIKit

public class VoiceInputModule: Module {
  private var capture: VoiceCapture?
  private var transcription: SystemAudioTranscription?

  public func definition() -> ModuleDefinition {
    Name("VoiceInput")
    Events("finished", "level")

    AsyncFunction("modelDirectory") { () -> String in
      var directory = try FileManager.default.url(
        for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
      ).appendingPathComponent("VoiceModels", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try directory.setResourceValues(values)
      return directory.absoluteString
    }

    AsyncFunction("decodeAudioChunk") { (uri: String, start: Double, duration: Double) in
      try AudioFileDecoder.decode(uri: uri, start: start, duration: duration)
    }

    AsyncFunction("systemTranscriptionStatus") { (language: String) in
      SystemAudioTranscription.status(language: language)
    }.runOnQueue(.main)

    AsyncFunction("transcribeAudioChunk") { (id: String, uri: String, language: String, promise: Promise) in
      guard self.transcription == nil else {
        promise.resolve(["error": "busy"])
        return
      }
      guard let transcription = SystemAudioTranscription(id: id, language: language, complete: { [weak self] result in
        self?.transcription = nil
        promise.resolve(result)
      }) else {
        promise.resolve(["error": "unsupported"])
        return
      }
      self.transcription = transcription
      transcription.start(uri: uri)
    }.runOnQueue(.main)

    AsyncFunction("cancelTranscription") { (id: String) in
      if self.transcription?.id == id { self.transcription?.cancel() }
    }.runOnQueue(.main)

    AsyncFunction("start") { (id: String) in
      guard self.capture == nil else { throw VoiceCaptureError.busy }
      let capture = try VoiceCapture(id: id) { [weak self] event, body in
        if event == "finished" { self?.capture = nil }
        self?.sendEvent(event, body)
      }
      self.capture = capture
      do { try capture.start() }
      catch {
        capture.cancel()
        self.capture = nil
        throw error
      }
    }.runOnQueue(.main)

    AsyncFunction("stop") { (id: String) in
      if self.capture?.id == id { self.capture?.finish() }
    }.runOnQueue(.main)

    AsyncFunction("cancel") { (id: String) in
      if self.capture?.id == id {
        self.capture?.cancel()
        self.capture = nil
      }
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async {
        self.capture?.cancel()
        self.capture = nil
        self.transcription?.cancel()
      }
    }
  }
}

private enum VoiceCaptureError: Error { case busy, unavailable }

/** All recorder, timer, interruption and completion operations run on the main queue. */
private final class VoiceCapture: NSObject, AVAudioRecorderDelegate {
  let id: String
  private let recorder: AVAudioRecorder
  private let emit: (String, [String: Any]) -> Void
  private var timer: Timer?
  private var observers: [NSObjectProtocol] = []
  private var ended = false

  init(id: String, emit: @escaping (String, [String: Any]) -> Void) throws {
    self.id = id
    self.emit = emit
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("VoiceInput")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    // The module admits one capture; leftovers from process death are disposable audio.
    for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
      try? FileManager.default.removeItem(at: file)
    }
    recorder = try AVAudioRecorder(
      url: directory.appendingPathComponent("\(UUID().uuidString).wav"),
      settings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: 16000,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false
      ]
    )
    super.init()
    recorder.delegate = self
    recorder.isMeteringEnabled = true
  }

  func start() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: [.allowBluetooth])
    try session.setActive(true)
    guard recorder.prepareToRecord(), recorder.record(forDuration: 30) else {
      throw VoiceCaptureError.unavailable
    }
    timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
      guard let self, !self.ended else { return }
      self.recorder.updateMeters()
      self.emit("level", ["id": self.id, "value": pow(10.0, Double(self.recorder.averagePower(forChannel: 0)) / 20.0)])
    }
    for name in [AVAudioSession.interruptionNotification, UIApplication.didEnterBackgroundNotification] {
      observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        self?.finish(error: "interrupted")
      })
    }
  }

  func finish(error: String? = nil) {
    guard !ended else { return }
    close()
    if let error {
      try? FileManager.default.removeItem(at: recorder.url)
      emit("finished", ["id": id, "error": error])
    } else {
      emit("finished", ["id": id, "uri": recorder.url.absoluteString])
    }
  }

  func cancel() {
    close()
    try? FileManager.default.removeItem(at: recorder.url)
  }

  private func close() {
    guard !ended else { return }
    ended = true
    timer?.invalidate()
    timer = nil
    observers.forEach(NotificationCenter.default.removeObserver)
    observers.removeAll()
    recorder.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    finish(error: flag ? nil : "recording-failed")
  }

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    finish(error: "recording-failed")
  }
}
