import ExpoModulesCore
import HealthKit

public class HealthAccessModule: Module {
  private let store = HKHealthStore()

  public func definition() -> ModuleDefinition {
    Name("HealthAccess")

    AsyncFunction("getAvailability") { () -> String in
      HKHealthStore.isHealthDataAvailable() ? "available" : "unsupported"
    }

    AsyncFunction("getStatuses") { (types: [String]) async throws -> [String: [String: Any]] in
      try await self.getStatuses(types)
    }

    AsyncFunction("request") { (types: [String]) async throws -> [String: [String: Any]] in
      let readTypes = Set(try types.map(self.objectType))
      try await self.store.requestAuthorization(toShare: [], read: readTypes)
      // Completion is not a read grant; recheck only whether authorization was requested.
      return try await self.getStatuses(types)
    }
  }

  private func getStatuses(_ types: [String]) async throws -> [String: [String: Any]] {
    var result: [String: [String: Any]] = [:]
    for name in types {
      let type = try objectType(name)
      let status: HKAuthorizationRequestStatus = try await withCheckedThrowingContinuation { continuation in
        store.getRequestStatusForAuthorization(toShare: [], read: [type]) { status, error in
          if let error { continuation.resume(throwing: error) }
          else { continuation.resume(returning: status) }
        }
      }
      switch status {
      case .shouldRequest:
        result[name] = ["state": "undetermined", "canAskAgain": true]
      case .unnecessary:
        result[name] = ["state": "requested", "canAskAgain": false]
      case .unknown:
        result[name] = ["state": "error", "canAskAgain": false]
      @unknown default:
        result[name] = ["state": "error", "canAskAgain": false]
      }
    }
    return result
  }

  private func objectType(_ name: String) throws -> HKObjectType {
    if name == "workouts" { return HKObjectType.workoutType() }
    if name == "sleep", let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      return type
    }
    let identifiers: [String: HKQuantityTypeIdentifier] = [
      "steps": .stepCount,
      "activeEnergy": .activeEnergyBurned,
      "distance": .distanceWalkingRunning,
      "heartRate": .heartRate,
      "restingHeartRate": .restingHeartRate,
      "hrv": .heartRateVariabilitySDNN
    ]
    if let identifier = identifiers[name], let type = HKObjectType.quantityType(forIdentifier: identifier) {
      return type
    }
    throw InvalidHealthTypeException(name)
  }
}

private class InvalidHealthTypeException: GenericException<String> {
  override var reason: String { "Unsupported health data type: \(param)" }
}
