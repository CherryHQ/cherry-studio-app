package expo.modules.jssandbox

import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.concurrent.ConcurrentHashMap

class JsSandboxModule : Module() {
  private val runs = ConcurrentHashMap.newKeySet<String>()

  override fun definition() = ModuleDefinition {
    Name("JsSandbox")
    Events("onMessage")

    AsyncFunction("run") { runId: String, code: String, limits: JsSandboxLimits, promise: Promise ->
      // A dedicated thread per run: a script that spins until its deadline must
      // not hold a shared executor, and parallel tool calls run side by side.
      launch(runId, promise) {
        val result = JsSandboxNative.run(
          runId.toByteArray(Charsets.UTF_8),
          code.toByteArray(Charsets.UTF_8),
          limits.timeoutMs,
          limits.memoryBytes,
          limits.maxResultBytes,
          limits.maxLogBytes,
        )
        String(result, Charsets.UTF_8)
      }
    }

    AsyncFunction("runFiles") { runId: String, code: String, limits: JsSandboxLimits, files: JsSandboxFiles, promise: Promise ->
      launch(runId, promise) {
        val result = JsSandboxNative.runFiles(
          runId.toByteArray(Charsets.UTF_8),
          code.toByteArray(Charsets.UTF_8),
          files.inputs.map { path(it).toByteArray(Charsets.UTF_8) }.toTypedArray(),
          (if (files.output.isEmpty()) "" else path(files.output)).toByteArray(Charsets.UTF_8),
          limits.timeoutMs,
          limits.memoryBytes,
          limits.maxResultBytes,
          limits.maxLogBytes,
        )
        String(result, Charsets.UTF_8)
      }
    }

    AsyncFunction("runBridge") { runId: String, setup: String, data: String, clock: JsSandboxClock, limits: JsSandboxLimits, promise: Promise ->
      launch(runId, promise) {
        val result = JsSandboxNative.runBridge(
          runId.toByteArray(Charsets.UTF_8), setup.toByteArray(Charsets.UTF_8),
          data.toByteArray(Charsets.UTF_8), clock.startedAt, clock.seed.toLong().toInt(),
          limits.timeoutMs, limits.memoryBytes,
          JsSandboxMessageSink { message ->
            sendEvent("onMessage", mapOf("runId" to runId, "message" to String(message, Charsets.UTF_8)))
          },
        )
        String(result, Charsets.UTF_8)
      }
    }

    Function("deliver") { runId: String, message: String ->
      JsSandboxNative.deliver(runId.toByteArray(Charsets.UTF_8), message.toByteArray(Charsets.UTF_8))
    }

    Function("cancel") { runId: String ->
      JsSandboxNative.cancel(runId.toByteArray(Charsets.UTF_8))
    }

    OnDestroy {
      runs.forEach { JsSandboxNative.cancel(it.toByteArray(Charsets.UTF_8)) }
    }
  }

  private fun launch(runId: String, promise: Promise, work: () -> String) {
    runs.add(runId)
    Thread(null, {
      try {
        promise.resolve(work())
      } catch (error: Exception) {
        promise.reject("ERR_JS_SANDBOX", error.message, error)
      } finally {
        runs.remove(runId)
      }
    }, "JsSandbox", STACK_SIZE_BYTES).start()
  }

  /** Hosts pass `file://` URIs; the native core opens plain paths. */
  private fun path(uri: String): String =
    if (uri.startsWith("file:")) Uri.parse(uri).path ?: uri else uri

  private companion object {
    /** QuickJS stops recursion at 7 MiB of this stack (`kMaxStackBytes`), leaving room for the native code below its checks. */
    const val STACK_SIZE_BYTES = 8L shl 20
  }
}

class JsSandboxClock : Record {
  @Field val startedAt: Double = 0.0
  @Field val seed: Double = 0.0
}

internal fun interface JsSandboxMessageSink {
  fun post(message: ByteArray)
}

class JsSandboxFiles : Record {
  @Field val inputs: List<String> = emptyList()
  @Field val output: String = ""
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
    timeoutMs: Int,
    memoryBytes: Int,
    maxResultBytes: Int,
    maxLogBytes: Int,
  ): ByteArray

  @JvmStatic
  external fun runFiles(
    runId: ByteArray,
    code: ByteArray,
    inputPaths: Array<ByteArray>,
    outputPath: ByteArray,
    timeoutMs: Int,
    memoryBytes: Int,
    maxResultBytes: Int,
    maxLogBytes: Int,
  ): ByteArray

  @JvmStatic
  external fun cancel(runId: ByteArray)

  @JvmStatic
  external fun runBridge(
    runId: ByteArray,
    setup: ByteArray,
    data: ByteArray,
    startedAt: Double,
    seed: Int,
    timeoutMs: Int,
    memoryBytes: Int,
    sink: JsSandboxMessageSink,
  ): ByteArray

  @JvmStatic
  external fun deliver(runId: ByteArray, message: ByteArray)
}
