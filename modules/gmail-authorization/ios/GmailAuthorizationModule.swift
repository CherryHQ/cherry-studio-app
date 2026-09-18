import AppAuth
import ExpoModulesCore
import GoogleSignIn

private let gmailReadScope = "https://www.googleapis.com/auth/gmail.readonly"

public class GmailAuthorizationModule: Module {
  private final class Operation {
    let promise: Promise
    init(_ promise: Promise) { self.promise = promise }
  }
  private var active: Operation?

  public func definition() -> ModuleDefinition {
    Name("GmailAuthorization")

    AsyncFunction("authorize") { (email: String?, interactive: Bool, promise: Promise) in
      guard let operation = self.start(promise) else { return }
      guard self.configure() else {
        self.fail(operation, "E_GMAIL_UNAVAILABLE")
        return
      }
      if interactive {
        guard let presenter = self.appContext?.utilities?.currentViewController() else {
          self.fail(operation, "E_GMAIL_UNAVAILABLE")
          return
        }
        GIDSignIn.sharedInstance.signIn(
          withPresenting: presenter, hint: email, additionalScopes: [gmailReadScope]
        ) { result, error in
          if let error { self.fail(operation, self.errorCode(error)) }
          else if let user = result?.user { self.finishAuthorization(operation, user, email) }
          else { self.fail(operation, "E_GMAIL_AUTHORIZATION") }
        }
      } else {
        guard let email else {
          self.fail(operation, "E_GMAIL_AUTHORIZATION")
          return
        }
        self.restore(operation) { user in
          guard self.matches(user, email) else {
            self.fail(operation, "E_GMAIL_AUTHORIZATION")
            return
          }
          user.refreshTokensIfNeeded { refreshed, error in
            if let error { self.fail(operation, self.errorCode(error)) }
            else if let refreshed { self.finishAuthorization(operation, refreshed, email) }
            else { self.fail(operation, "E_GMAIL_AUTHORIZATION") }
          }
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("revoke") { (email: String, promise: Promise) in
      guard let operation = self.start(promise) else { return }
      guard self.configure() else {
        self.fail(operation, "E_GMAIL_UNAVAILABLE")
        return
      }
      self.restore(operation) { user in
        // Never revoke whichever account happens to be current if it differs from the grant.
        guard self.matches(user, email) else {
          self.fail(operation, "E_GMAIL_AUTHORIZATION")
          return
        }
        GIDSignIn.sharedInstance.disconnect { error in
          if let error { self.fail(operation, self.errorCode(error)) }
          else { self.succeed(operation, nil) }
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("clearToken") { (token: String, promise: Promise) in
      guard self.active == nil else {
        promise.reject("E_GMAIL_BUSY", "Google authorization is already in progress")
        return
      }
      // Google Sign-In has no public cache-invalidation API. A rejected session must sign in again.
      if GIDSignIn.sharedInstance.currentUser?.accessToken.tokenString == token {
        GIDSignIn.sharedInstance.signOut()
      }
      promise.resolve(nil)
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async {
        if let operation = self.active { self.fail(operation, "E_GMAIL_CANCELLED") }
      }
    }
  }

  private func configure() -> Bool {
    guard let clientId = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
          clientId.hasSuffix(".apps.googleusercontent.com") else { return false }
    let scheme = clientId.components(separatedBy: ".").reversed().joined(separator: ".")
    let urlTypes = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]]
    guard urlTypes?.contains(where: {
      ($0["CFBundleURLSchemes"] as? [String])?.contains(scheme) == true
    }) == true else { return false }
    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientId)
    return true
  }

  private func start(_ promise: Promise) -> Operation? {
    guard active == nil else {
      promise.reject("E_GMAIL_BUSY", "Google authorization is already in progress")
      return nil
    }
    let operation = Operation(promise)
    active = operation
    return operation
  }

  private func restore(_ operation: Operation, _ completion: @escaping (GIDGoogleUser) -> Void) {
    if let user = GIDSignIn.sharedInstance.currentUser { completion(user) }
    else {
      GIDSignIn.sharedInstance.restorePreviousSignIn { user, error in
        guard self.active === operation else { return }
        if let error { self.fail(operation, self.errorCode(error)) }
        else if let user { completion(user) }
        else { self.fail(operation, "E_GMAIL_AUTHORIZATION") }
      }
    }
  }

  private func matches(_ user: GIDGoogleUser, _ email: String) -> Bool {
    user.profile?.email.caseInsensitiveCompare(email) == .orderedSame
  }

  private func finishAuthorization(_ operation: Operation, _ user: GIDGoogleUser, _ email: String?) {
    guard user.grantedScopes?.contains(gmailReadScope) == true else {
      fail(operation, "E_GMAIL_AUTHORIZATION")
      return
    }
    if let email, !matches(user, email) {
      fail(operation, "E_GMAIL_AUTHORIZATION")
      return
    }
    succeed(operation, [
      "accessToken": user.accessToken.tokenString,
      "grantedScopes": user.grantedScopes ?? []
    ])
  }

  private func succeed(_ operation: Operation, _ value: Any?) {
    guard active === operation else { return }
    active = nil
    operation.promise.resolve(value)
  }

  private func fail(_ operation: Operation, _ code: String) {
    guard active === operation else { return }
    active = nil
    operation.promise.reject(code, "Google authorization could not complete")
  }

  private func errorCode(_ error: Error, depth: Int = 0) -> String {
    let error = error as NSError
    if error.domain == NSURLErrorDomain { return "E_GMAIL_NETWORK" }
    if error.domain == kGIDSignInErrorDomain {
      if error.code == -5 { return "E_GMAIL_CANCELLED" }
      if error.code == -2 { return "E_GMAIL_STORAGE" }
      if [-4, -6, -9].contains(error.code) { return "E_GMAIL_AUTHORIZATION" }
    }
    if error.domain == OIDOAuthTokenErrorDomain { return "E_GMAIL_AUTHORIZATION" }
    if depth < 4, let underlying = error.userInfo[NSUnderlyingErrorKey] as? Error {
      return errorCode(underlying, depth: depth + 1)
    }
    // An unknown SDK/network error does not establish that a saved grant was revoked.
    return "E_GMAIL_NETWORK"
  }
}
