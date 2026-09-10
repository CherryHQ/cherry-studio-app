package expo.modules.diagnostics

import java.io.File
import org.json.JSONObject

/** Process-owned observer; always delegates termination to Android's handler. */
internal object DiagnosticCrashCapture {
  private var installed = false

  @Synchronized fun start(root: File) {
    if (installed) return
    val previous = Thread.getDefaultUncaughtExceptionHandler() ?: return
    installed = true
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val timestamp = System.currentTimeMillis()
        File(root, "java-$timestamp-${thread.id}.json").writeText(JSONObject()
          .put("timestamp", timestamp).put("thread", thread.name)
          .put("exception", error.javaClass.name).put("message", error.message)
          .put("stack", error.stackTraceToString()).toString())
      } catch (_: Throwable) { /* Recording must never swallow the original crash. */ }
      finally { previous.uncaughtException(thread, error) }
    }
  }
}
