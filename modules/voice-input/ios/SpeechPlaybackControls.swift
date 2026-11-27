import AVFoundation
import MediaPlayer

/** Publishes Now Playing metadata and handles Lock Screen / Control Center commands on the main queue. */
final class SpeechPlaybackControls {
  private static weak var activeOwner: SpeechPlaybackControls?

  private var currentId: String?
  private var currentState: String = "preparing"
  private var currentTitle: String = ""
  private var currentSubtitle: String = ""
  private var onCommand: ((String) -> Void)?
  private var playTarget: Any?
  private var pauseTarget: Any?
  private var toggleTarget: Any?
  private var stopTarget: Any?
  private var interruptionObserver: NSObjectProtocol?

  private var isActiveOwner: Bool {
    Self.activeOwner === self
  }

  func begin(
    id: String,
    title: String,
    subtitle: String,
    onCommand: @escaping (String) -> Void
  ) {
    endAll()
    Self.activeOwner = self
    currentId = id
    currentState = "preparing"
    currentTitle = title
    currentSubtitle = subtitle
    self.onCommand = onCommand

    let center = MPRemoteCommandCenter.shared()
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
    center.changePlaybackPositionCommand.isEnabled = false

    center.playCommand.isEnabled = true
    playTarget = center.playCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { [weak self] in
        guard let self, self.isActiveOwner, self.currentId == id else { return }
        self.onCommand?("resume")
      }
      return .success
    }

    center.pauseCommand.isEnabled = true
    pauseTarget = center.pauseCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { [weak self] in
        guard let self, self.isActiveOwner, self.currentId == id else { return }
        self.onCommand?("pause")
      }
      return .success
    }

    center.togglePlayPauseCommand.isEnabled = true
    toggleTarget = center.togglePlayPauseCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { [weak self] in
        guard let self, self.isActiveOwner, self.currentId == id else { return }
        self.onCommand?(self.currentState == "paused" ? "resume" : "pause")
      }
      return .success
    }

    center.stopCommand.isEnabled = true
    stopTarget = center.stopCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { [weak self] in
        guard let self, self.isActiveOwner, self.currentId == id else { return }
        self.onCommand?("stop")
      }
      return .success
    }

    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let self, self.isActiveOwner, self.currentId == id,
            let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: rawType) else { return }
      switch type {
      case .began:
        self.onCommand?("interrupt")
      case .ended:
        let shouldResume: Bool
        if let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt {
          shouldResume = AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume)
        } else {
          shouldResume = false
        }
        if shouldResume {
          self.onCommand?("resume-interruption")
        }
      @unknown default:
        break
      }
    }

    applyNowPlaying()
  }

  func updateState(id: String, state: String) {
    guard isActiveOwner, currentId == id else { return }
    currentState = state
    applyNowPlaying()
  }

  func end(id: String) {
    guard currentId == id else { return }
    endAll()
  }

  func endAll() {
    let center = MPRemoteCommandCenter.shared()
    if let playTarget { center.playCommand.removeTarget(playTarget) }
    if let pauseTarget { center.pauseCommand.removeTarget(pauseTarget) }
    if let toggleTarget { center.togglePlayPauseCommand.removeTarget(toggleTarget) }
    if let stopTarget { center.stopCommand.removeTarget(stopTarget) }
    playTarget = nil
    pauseTarget = nil
    toggleTarget = nil
    stopTarget = nil

    if let interruptionObserver {
      NotificationCenter.default.removeObserver(interruptionObserver)
    }
    interruptionObserver = nil
    currentId = nil
    currentState = "preparing"
    currentTitle = ""
    currentSubtitle = ""
    onCommand = nil

    // A replaced or torn-down module must not wipe global Now Playing state owned by a newer instance.
    guard Self.activeOwner == nil || Self.activeOwner === self else { return }
    Self.activeOwner = nil

    center.playCommand.isEnabled = false
    center.pauseCommand.isEnabled = false
    center.togglePlayPauseCommand.isEnabled = false
    center.stopCommand.isEnabled = false

    let infoCenter = MPNowPlayingInfoCenter.default()
    infoCenter.nowPlayingInfo = nil
    infoCenter.playbackState = .stopped
  }

  private func applyNowPlaying() {
    guard isActiveOwner else { return }
    let infoCenter = MPNowPlayingInfoCenter.default()
    let rate = currentState == "playing" ? 1.0 : 0.0
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: currentTitle,
      MPNowPlayingInfoPropertyPlaybackRate: rate
    ]
    if !currentSubtitle.isEmpty {
      info[MPMediaItemPropertyArtist] = currentSubtitle
    }
    infoCenter.nowPlayingInfo = info
    switch currentState {
    case "playing":
      infoCenter.playbackState = .playing
    case "paused":
      infoCenter.playbackState = .paused
    default:
      infoCenter.playbackState = .interrupted
    }
  }
}
