import ExpoModulesCore

public class JsSandboxModule: Module {
  public func definition() -> ModuleDefinition {
    Name("JsSandbox")

    AsyncFunction("run") { (runId: String, code: String, limits: JsSandboxLimits, promise: Promise) in
      // A dedicated thread per run: a script that spins until its deadline must
      // not hold a shared queue, and parallel tool calls run side by side.
      let thread = Thread {
        promise.resolve(
          JsSandboxRunner.run(
            id: runId,
            code: code,
            timeoutMs: UInt32(clamping: limits.timeoutMs),
            softHeapBytes: UInt32(clamping: limits.softHeapBytes),
            hardHeapBytes: UInt32(clamping: limits.hardHeapBytes),
            maxResultBytes: UInt32(clamping: limits.maxResultBytes),
            maxLogBytes: UInt32(clamping: limits.maxLogBytes)
          )
        )
      }
      thread.name = "JsSandbox"
      thread.stackSize = JsSandboxModule.stackSize
      thread.qualityOfService = .userInitiated
      thread.start()
    }

    Function("cancel") { (runId: String) in
      JsSandboxRunner.cancel(id: runId)
    }
  }

  /// Hermes bounds JavaScript recursion itself; this covers native recursion in
  /// the parser, JSON, and regular expressions.
  private static let stackSize = 4 << 20
}

struct JsSandboxLimits: Record {
  @Field var timeoutMs: Int = 0
  @Field var softHeapBytes: Int = 0
  @Field var hardHeapBytes: Int = 0
  @Field var maxResultBytes: Int = 0
  @Field var maxLogBytes: Int = 0
}
