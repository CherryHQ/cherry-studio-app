import ExpoModulesCore

public class JsSandboxModule: Module {
  public func definition() -> ModuleDefinition {
    Name("JsSandbox")

    AsyncFunction("run") { (runId: String, code: String, storeJson: String, limits: JsSandboxLimits, promise: Promise) in
      // A dedicated thread per run: a script that spins until its deadline must
      // not hold a shared queue, and parallel tool calls run side by side.
      let thread = Thread {
        promise.resolve(
          JsSandboxRunner.run(
            id: runId,
            code: code,
            storeJson: storeJson,
            timeoutMs: UInt32(clamping: limits.timeoutMs),
            memoryBytes: UInt32(clamping: limits.memoryBytes),
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

  /// QuickJS stops recursion at 7 MiB of this stack (`kMaxStackBytes`), which
  /// leaves room for the native code below its checks.
  private static let stackSize = 8 << 20
}

struct JsSandboxLimits: Record {
  @Field var timeoutMs: Int = 0
  @Field var memoryBytes: Int = 0
  @Field var maxResultBytes: Int = 0
  @Field var maxLogBytes: Int = 0
}
