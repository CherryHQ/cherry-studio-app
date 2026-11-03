package expo.modules.ssh

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class SshModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Ssh")
    Constants("resultVersion" to 2)
    Events("onEvent")
    Function("prepare") { id: String -> SshNative.prepare(id.toByteArray(Charsets.UTF_8)) }
    Function("cancel") { id: String -> SshNative.cancel(id.toByteArray(Charsets.UTF_8)) }
    Function("respond") { id: String, challenge: String, responses: List<String> ->
      SshNative.respond(id.toByteArray(Charsets.UTF_8), challenge.toByteArray(Charsets.UTF_8), responses.map { it.toByteArray(Charsets.UTF_8) }.toTypedArray())
    }
    Function("closePool") { key: String -> SshNative.closePool(key.toByteArray(Charsets.UTF_8)) }
    Function("closeAll") { SshNative.closeAll() }
    AsyncFunction("maintain") { promise: Promise ->
      Thread { promise.resolve(SshNative.maintain()) }.start()
    }
    AsyncFunction("run") { id: String, options: SshOptions, promise: Promise ->
      Thread {
        try {
          val result = SshNative.run(id.toByteArray(Charsets.UTF_8),
            arrayOf(options.host, options.username, options.fingerprint, options.password,
              options.privateKey, options.passphrase, options.command, options.cwd, options.stdin,
              options.directory, options.poolKey, options.operation, options.path, options.localPath, options.content).map { it.toByteArray(Charsets.UTF_8) }.toTypedArray(),
            options.port, options.timeoutMs, options.probe, options.overwrite,
            SshOutput { stream, data ->
              sendEvent("onEvent", mapOf("runId" to id, "stream" to String(stream, Charsets.UTF_8), "base64" to String(data, Charsets.UTF_8)))
            })
          promise.resolve(String(result, Charsets.UTF_8))
        } catch (error: Exception) {
          promise.reject("ERR_SSH", "Native SSH operation failed", null)
        }
      }.start()
    }
    OnDestroy { SshNative.cancelAll(); SshNative.closeAll() }
  }
}

class SshOptions : Record {
  @Field var host: String = ""
  @Field var username: String = ""
  @Field var fingerprint: String = ""
  @Field var password: String = ""
  @Field var privateKey: String = ""
  @Field var passphrase: String = ""
  @Field var command: String = ""
  @Field var cwd: String = ""
  @Field var stdin: String = ""
  @Field var directory: String = "."
  @Field var poolKey: String = ""
  @Field var operation: String = "exec"
  @Field var path: String = ""
  @Field var localPath: String = ""
  @Field var content: String = ""
  @Field var overwrite: Boolean = false
  @Field var port: Int = 22
  @Field var timeoutMs: Int = 60000
  @Field var probe: Boolean = false
}

fun interface SshOutput { fun emit(stream: ByteArray, data: ByteArray) }
object SshNative {
  init { System.loadLibrary("cherryssh") }
  @JvmStatic external fun prepare(id: ByteArray): Boolean
  @JvmStatic external fun cancel(id: ByteArray)
  @JvmStatic external fun cancelAll()
  @JvmStatic external fun respond(id: ByteArray, challenge: ByteArray, responses: Array<ByteArray>)
  @JvmStatic external fun closePool(key: ByteArray)
  @JvmStatic external fun closeAll()
  @JvmStatic external fun maintain(): Int
  @JvmStatic external fun run(id: ByteArray, strings: Array<ByteArray>, port: Int, timeout: Int, probe: Boolean, overwrite: Boolean, output: SshOutput): ByteArray
}
