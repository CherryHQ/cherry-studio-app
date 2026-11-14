import AVFoundation
import UIKit

/** Task-owned silent playback. Voice uses temporarily take priority. Main queue only. */
final class BackgroundAudio {
  private var owner: String?
  private var onChange: ((String, Bool) -> Void)?
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var uses: [String: String] = [:]
  private var interrupted = false
  private var lastReportedState: Bool?
  private var observers: [NSObjectProtocol] = []

  init() {
    let center = NotificationCenter.default
    observers = [
      center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] notification in
        self?.handleInterruption(notification)
      },
      center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
        self?.stopEngine()
        self?.refresh()
      },
      center.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main) { [weak self] notification in
        guard let self, let changed = notification.object as? AVAudioEngine, changed === self.engine else { return }
        self.stopEngine()
        self.refresh()
      },
      center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.interrupted = false
        self?.refresh()
      },
    ]
  }

  func begin(id: String, onChange: @escaping (String, Bool) -> Void) -> Bool {
    if owner != id {
      stopEngine()
      lastReportedState = nil
    }
    owner = id
    self.onChange = onChange
    refresh()
    return isProtected
  }

  func end(id: String) {
    guard owner == id else { return }
    owner = nil
    onChange = nil
    lastReportedState = nil
    stopEngine()
  }

  func beginUse(id: String, kind: String) {
    uses[id] = kind
    // Keep silence under speech to bridge gaps between utterances; capture needs it stopped.
    if kind == "capture" { stopEngine() }
    publishState()
  }

  func endUse(id: String) {
    guard uses.removeValue(forKey: id) != nil else { return }
    if uses.isEmpty { stopEngine() }
    refresh()
  }

  func dispose() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers = []
    owner = nil
    onChange = nil
    uses.removeAll()
    stopEngine()
  }

  private var isProtected: Bool {
    guard owner != nil, !interrupted else { return false }
    if !uses.isEmpty {
      return !uses.values.contains("capture") && uses.values.contains("speech")
    }
    return engine?.isRunning == true && player?.isPlaying == true
  }

  private func refresh() {
    guard owner != nil else { return }
    guard !interrupted, !uses.values.contains("capture") else {
      stopEngine()
      publishState()
      return
    }
    if engine?.isRunning == true && player?.isPlaying == true {
      publishState()
      return
    }
    stopEngine()
    do {
      let session = AVAudioSession.sharedInstance()
      // Real speech owns its profile. Its existing session can also render the silent loop.
      if uses.isEmpty {
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      }
      try session.setActive(true)
      let nextEngine = AVAudioEngine()
      let nextPlayer = AVAudioPlayerNode()
      guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1),
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 44100),
            let samples = buffer.floatChannelData?[0] else {
        publishState()
        return
      }
      buffer.frameLength = 44100
      samples.initialize(repeating: 0, count: Int(buffer.frameLength))
      nextEngine.attach(nextPlayer)
      nextEngine.connect(nextPlayer, to: nextEngine.mainMixerNode, format: format)
      nextPlayer.scheduleBuffer(buffer, at: nil, options: .loops)
      try nextEngine.start()
      nextPlayer.play()
      engine = nextEngine
      player = nextPlayer
    } catch {
      NSLog("Cherry background audio could not start: %@", String(describing: error))
    }
    publishState()
  }

  private func stopEngine() {
    let previousEngine = engine
    let previousPlayer = player
    engine = nil
    player = nil
    previousPlayer?.stop()
    previousEngine?.stop()
    // Never deactivate the shared session here: voice or an attachment may still use it.
  }

  private func publishState() {
    guard let owner else { return }
    let active = isProtected
    guard lastReportedState != active else { return }
    lastReportedState = active
    onChange?(owner, active)
  }

  private func handleInterruption(_ notification: Notification) {
    guard let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: rawType) else { return }
    if type == .began {
      interrupted = true
      stopEngine()
      publishState()
    } else {
      let options = (notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
      interrupted = !AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume)
      refresh()
    }
  }
}
