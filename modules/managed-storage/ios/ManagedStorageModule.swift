import ExpoModulesCore
import Foundation

public class ManagedStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ManagedStorage")

    Function("getApplicationSupportDirectory") { () throws -> String in
      let url = try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      )
      return url.absoluteString
    }
  }
}
