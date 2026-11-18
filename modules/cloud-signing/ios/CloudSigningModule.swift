import CryptoKit
import ExpoModulesCore
import Foundation

public class CloudSigningModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CherryCloudSigning")

    AsyncFunction("sign") { (value: String) -> String? in
      guard
        let secret = Bundle.main.object(forInfoDictionaryKey: "CherryCloudClientSecret") as? String,
        !secret.isEmpty
      else { return nil }
      let key = SymmetricKey(data: Data(secret.utf8))
      return HMAC<SHA256>.authenticationCode(for: Data(value.utf8), using: key)
        .map { String(format: "%02x", $0) }.joined()
    }
  }
}
