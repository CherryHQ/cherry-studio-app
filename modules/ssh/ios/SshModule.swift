import ExpoModulesCore

public class SshModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Ssh")
    Events("onOutput")
    Function("prepare") { (id: String) in SshRunner.prepare(id) }
    Function("cancel") { (id: String) in SshRunner.cancel(id) }
    AsyncFunction("run") { (id: String, options: SshOptions, promise: Promise) in
      Thread {
        let result = SshRunner.run(id, strings: [options.host, options.username, options.fingerprint,
          options.password, options.privateKey, options.passphrase, options.command],
          port: Int32(clamping: options.port), timeout: Int32(clamping: options.timeoutMs), probe: options.probe
        ) { stream, base64 in
          self.sendEvent("onOutput", ["runId": id, "stream": stream, "base64": base64])
        }
        promise.resolve(result)
      }.start()
    }
    OnDestroy { SshRunner.cancelAll() }
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
  @Field var port: Int = 22
  @Field var timeoutMs: Int = 60000
  @Field var probe: Bool = false
}
