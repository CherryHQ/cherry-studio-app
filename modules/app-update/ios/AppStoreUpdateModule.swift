import ExpoModulesCore
import Foundation
import StoreKit

public class AppStoreUpdateModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppStoreUpdate")

    AsyncFunction("getStorefrontCountry") { () async -> String? in
      guard let storefront = await Storefront.current else { return nil }
      let components = Locale.Language.Components(identifier: "und_\(storefront.countryCode)")
      guard let country = components.region?.identifier, country.utf8.count == 2 else { return nil }
      return country
    }
  }
}
