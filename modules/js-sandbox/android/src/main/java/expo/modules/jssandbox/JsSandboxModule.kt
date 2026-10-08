package expo.modules.jssandbox

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class JsSandboxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JsSandbox")

    AsyncFunction("run") { runId: String, code: String, storeJson: String, limits: JsSandboxLimits, promise: Promise ->
      // A dedicated thread per run: a script that spins until its deadline must
      // not hold a shared executor, and parallel tool calls run side by side.
      Thread(null, {
        val result = JsSandboxNative.run(
          runId.toByteArray(Charsets.UTF_8),
          code.toByteArray(Charsets.UTF_8),
          storeJson.toByteArray(Charsets.UTF_8),
          limits.timeoutMs,
          limits.memoryBytes,
          limits.maxResultBytes,
          limits.maxLogBytes,
        )
        promise.resolve(String(result, Charsets.UTF_8))
      }, "JsSandbox", STACK_SIZE_BYTES).start()
    }

    Function("cancel") { runId: String ->
      JsSandboxNative.cancel(runId.toByteArray(Charsets.UTF_8))
    }
  }

  private companion object {
    /** QuickJS stops recursion at 7 MiB of this stack (`kMaxStackBytes`), leaving room for the native code below its checks. */
    const val STACK_SIZE_BYTES = 8L shl 20
  }
}

class JsSandboxLimits : Record {
  @Field val timeoutMs: Int = 0
  @Field val memoryBytes: Int = 0
  @Field val maxResultBytes: Int = 0
  @Field val maxLogBytes: Int = 0
}

internal object JsSandboxNative {
  init {
    System.loadLibrary("jssandbox")
  }

  @JvmStatic
  external fun run(
    runId: ByteArray,
    code: ByteArray,
    storeJson: ByteArray,
    timeoutMs: Int,
    memoryBytes: Int,
    maxResultBytes: Int,
    maxLogBytes: Int,
  ): ByteArray

  @JvmStatic
  external fun cancel(runId: ByteArray)
}
