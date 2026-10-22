import ExpoModulesCore

public class JsSandboxModule: Module {
  private let runLock = NSLock()
  private var runs = Set<String>()

  public func definition() -> ModuleDefinition {
    Name("JsSandbox")
    Events("onMessage")

    AsyncFunction("run") { (runId: String, code: String, limits: JsSandboxLimits, promise: Promise) in
      // A dedicated thread per run: a script that spins until its deadline must
      // not hold a shared queue, and parallel tool calls run side by side.
      self.launch(runId, promise: promise) {
          JsSandboxRunner.run(
            id: runId,
            code: code,
            timeoutMs: UInt32(clamping: limits.timeoutMs),
            memoryBytes: UInt32(clamping: limits.memoryBytes),
            maxResultBytes: UInt32(clamping: limits.maxResultBytes),
            maxLogBytes: UInt32(clamping: limits.maxLogBytes)
          )
      }
    }

    AsyncFunction("runFiles") { (runId: String, code: String, limits: JsSandboxLimits, files: JsSandboxFiles, promise: Promise) in
      self.launch(runId, promise: promise) {
        JsSandboxRunner.run(
          id: runId,
          code: code,
          inputPaths: files.inputs.map(JsSandboxModule.path),
          outputPath: files.output.isEmpty ? "" : JsSandboxModule.path(files.output),
          timeoutMs: UInt32(clamping: limits.timeoutMs),
          memoryBytes: UInt32(clamping: limits.memoryBytes),
          maxResultBytes: UInt32(clamping: limits.maxResultBytes),
          maxLogBytes: UInt32(clamping: limits.maxLogBytes)
        )
      }
    }

    AsyncFunction("runBridge") { (runId: String, setup: String, data: String, clock: JsSandboxClock, limits: JsSandboxLimits, promise: Promise) in
      self.launch(runId, promise: promise) {
        JsSandboxRunner.runBridge(
          id: runId, setup: setup, data: data,
          startedAt: clock.startedAt, seed: UInt32(clamping: Int64(clock.seed)),
          timeoutMs: UInt32(clamping: limits.timeoutMs),
          memoryBytes: UInt32(clamping: limits.memoryBytes)
        ) { message in
          self.sendEvent("onMessage", ["runId": runId, "message": message])
        }
      }
    }

    Function("deliver") { (runId: String, message: String) in
      JsSandboxRunner.deliver(id: runId, message: message)
    }

    Function("cancel") { (runId: String) in
      JsSandboxRunner.cancel(id: runId)
    }

    OnDestroy {
      self.runLock.lock()
      let active = self.runs
      self.runLock.unlock()
      for id in active { JsSandboxRunner.cancel(id: id) }
    }
  }

  private func launch(_ runId: String, promise: Promise, work: @escaping () -> String) {
    runLock.lock()
    runs.insert(runId)
    runLock.unlock()
    let thread = Thread {
      let result = work()
      self.runLock.lock()
      self.runs.remove(runId)
      self.runLock.unlock()
      promise.resolve(result)
    }
    thread.name = "JsSandbox"
    thread.stackSize = JsSandboxModule.stackSize
    thread.qualityOfService = .userInitiated
    thread.start()
  }

  /// Hosts pass `file://` URIs; the native core opens plain paths.
  private static func path(_ uri: String) -> String {
    guard let url = URL(string: uri), url.isFileURL else { return uri }
    return url.path
  }

  /// QuickJS stops recursion at 7 MiB of this stack (`kMaxStackBytes`), which
  /// leaves room for the native code below its checks.
  private static let stackSize = 8 << 20
}

struct JsSandboxClock: Record {
  @Field var startedAt: Double = 0
  @Field var seed: Double = 0
}

struct JsSandboxFiles: Record {
  @Field var inputs: [String] = []
  @Field var output: String = ""
}

struct JsSandboxLimits: Record {
  @Field var timeoutMs: Int = 0
  @Field var memoryBytes: Int = 0
  @Field var maxResultBytes: Int = 0
  @Field var maxLogBytes: Int = 0
}
