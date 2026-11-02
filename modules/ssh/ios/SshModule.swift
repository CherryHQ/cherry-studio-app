import ExpoModulesCore

public class SshModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Ssh")
    Events("onEvent")
    Function("prepare") { (id: String) in SshRunner.prepare(id) }
    Function("cancel") { (id: String) in SshRunner.cancel(id) }
    Function("respond") { (id: String, challenge: String, responses: [String]) in
      SshRunner.respond(id, challenge: challenge, responses: responses)
    }
    Function("closePool") { (key: String) in SshRunner.closePool(key) }
    Function("closeAll") { SshRunner.closeAll() }
    AsyncFunction("maintain") { (promise: Promise) in
      Thread { promise.resolve(SshRunner.maintain()) }.start()
    }
    AsyncFunction("run") { (id: String, options: SshOptions, promise: Promise) in
      Thread {
        let result = SshRunner.run(id, strings: [options.host, options.username, options.fingerprint,
          options.password, options.privateKey, options.passphrase, options.command,
          options.cwd, options.stdin, options.directory, options.poolKey, options.operation,
          options.path, options.localPath, options.content],
          port: Int32(clamping: options.port), timeout: Int32(clamping: options.timeoutMs), probe: options.probe, overwrite: options.overwrite
        ) { stream, base64 in
          self.sendEvent("onEvent", ["runId": id, "stream": stream, "base64": base64])
        }
        promise.resolve(result)
      }.start()
    }
    OnDestroy { SshRunner.cancelAll(); SshRunner.closeAll() }
  }
}

struct SshOptions: Record {
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
  @Field var overwrite: Bool = false
  @Field var port: Int = 22
  @Field var timeoutMs: Int = 60000
  @Field var probe: Bool = false
}
