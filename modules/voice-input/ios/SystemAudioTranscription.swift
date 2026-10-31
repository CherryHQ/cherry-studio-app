import Foundation
import Speech

/** File-only requests. Unlike live dictation, unsupported on-device locales must never fall back. */
final class SystemAudioTranscription {
  let id: String
  private let recognizer: SFSpeechRecognizer
  private let complete: ([String: Any]) -> Void
  private var task: SFSpeechRecognitionTask?
  private var timeout: Timer?
  private var ended = false

  static func status(language: String) -> String {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) else {
      return "unsupported"
    }
    return recognizer.supportsOnDeviceRecognition && recognizer.isAvailable ? "ready" : "needs-setup"
  }

  init?(id: String, language: String, complete: @escaping ([String: Any]) -> Void) {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) else { return nil }
    self.id = id
    self.recognizer = recognizer
    self.complete = complete
  }

  // All entry points and completions are confined to the main queue.
  func start(uri: String) {
    guard recognizer.supportsOnDeviceRecognition, recognizer.isAvailable else {
      finish(["error": "offline-recognition-unavailable"])
      return
    }
    guard let url = URL(string: uri), url.isFileURL else {
      finish(["error": "failed"])
      return
    }
    let request = SFSpeechURLRecognitionRequest(url: url)
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false
    request.addsPunctuation = true
    request.taskHint = .dictation
    timeout = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) { [weak self] _ in
      self?.finish(["error": "failed"])
    }
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      DispatchQueue.main.async {
        guard let self, !self.ended else { return }
        if let result, result.isFinal {
          self.finish(["text": result.bestTranscription.formattedString])
        } else if let error = error as NSError? {
          // Apple's no-speech error is an empty window, not a failed whole-file operation.
          let code = error.domain == "kAFAssistantErrorDomain" && error.code == 1110 ? "no-speech" : "failed"
          self.finish(["error": code])
        }
      }
    }
  }

  func cancel() { finish(["error": "failed"]) }

  private func finish(_ result: [String: Any]) {
    guard !ended else { return }
    ended = true
    timeout?.invalidate()
    timeout = nil
    task?.cancel()
    task = nil
    complete(result)
  }
}
