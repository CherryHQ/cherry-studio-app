package expo.modules.jssandbox

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class JsSandboxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JsSandbox")

    AsyncFunction("run") { runId: String, code: String, limits: JsSandboxLimits, promise: Promise ->
      // A dedicated thread per run: a script that spins until its deadline must
      // not hold a shared executor, and parallel tool calls run side by side. A
      // Java thread is already attached to the VM, which Hermes' Intl needs.
      Thread(null, {
        val result = JsSandboxNative.run(
          runId.toByteArray(Charsets.UTF_8),
          code.toByteArray(Charsets.UTF_8),
          limits.timeoutMs,
          limits.softHeapBytes,
          limits.hardHeapBytes,
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
    /** Hermes bounds JavaScript recursion; this covers native recursion in the parser, JSON, and regular expressions. */
    const val STACK_SIZE_BYTES = 4L shl 20
  }
}

class JsSandboxLimits : Record {
  @Field val timeoutMs: Int = 0
  @Field val softHeapBytes: Int = 0
  @Field val hardHeapBytes: Int = 0
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
    timeoutMs: Int,
    softHeapBytes: Int,
    hardHeapBytes: Int,
    maxResultBytes: Int,
    maxLogBytes: Int,
  ): ByteArray

  @JvmStatic
  external fun cancel(runId: ByteArray)
}
