import ExpoModulesCore
import HealthKit

public class HealthAccessModule: Module {
  private let store = HKHealthStore()

  public func definition() -> ModuleDefinition {
    Name("HealthAccess")

    AsyncFunction("getAvailability") { () -> String in
      HKHealthStore.isHealthDataAvailable() ? "available" : "unsupported"
    }
    AsyncFunction("getStatuses") {
      (types: [HealthTypeRecord]) async throws -> [String: [String: Any]] in
      try await self.getStatuses(types)
    }
    AsyncFunction("request") {
      (types: [HealthTypeRecord]) async throws -> [String: [String: Any]] in
      let supported = types.filter { (try? self.objectType($0)) != nil }
      let readTypes = Set(
        supported.flatMap(\.authorization).compactMap { try? self.objectType($0) })
      let ordinary = Set(readTypes.filter { !$0.requiresPerObjectAuthorization() })
      if !ordinary.isEmpty {
        try await self.store.requestAuthorization(toShare: [], read: ordinary)
      }
      for type in readTypes where type.requiresPerObjectAuthorization() {
        try await self.store.requestPerObjectReadAuthorization(for: type, predicate: nil)
        // This flag records that the selection sheet completed, never a read grant.
        UserDefaults.standard.set(true, forKey: self.requestedKey(type))
      }
      return try await self.getStatuses(types)
    }
    AsyncFunction("getTypeAvailability") { (types: [HealthTypeRecord]) -> [String: [String: Any]] in
      Dictionary(
        uniqueKeysWithValues: types.map { descriptor in
          let type = try? self.objectType(descriptor)
          return (
            descriptor.name,
            ["available": type != nil, "identifier": type?.identifier as Any? ?? NSNull()]
          )
        })
    }
    AsyncFunction("query") {
      (type: HealthTypeRecord, options: HealthQueryRecord) async throws -> [String: Any] in
      let objectType = try self.objectType(type)
      var result = try await HealthDataReader(store: self.store).query(objectType, options: options)
      result["identifier"] = objectType.identifier
      return result
    }
    AsyncFunction("getRecord") {
      (type: HealthTypeRecord, options: HealthRecordRequest) async throws -> [String: Any] in
      let objectType = try self.objectType(type)
      return try await HealthDataReader(store: self.store).record(objectType, options: options)
    }
    AsyncFunction("listWorkouts") {
      (startDate: String, endDate: String, limit: Int) async throws -> [[String: Any]] in
      try await HealthDataReader(store: self.store).workouts(
        start: healthDate(startDate), end: healthDate(endDate), limit: limit)
    }
    AsyncFunction("shareVerifiableRecords") {
      (options: HealthVerifiableRecordRequest) async throws -> [String: Any] in
      try await HealthDataReader(store: self.store).verifiableRecords(options)
    }
  }

  private func getStatuses(_ types: [HealthTypeRecord]) async throws -> [String: [String: Any]] {
    var result: [String: [String: Any]] = [:]
    for descriptor in types {
      guard (try? objectType(descriptor)) != nil else {
        result[descriptor.name] = [
          "state": "unavailable", "canAskAgain": false, "reason": "unsupported",
        ]
        continue
      }
      let readTypes = Set(descriptor.authorization.compactMap { try? objectType($0) })
      if readTypes.contains(where: { $0.requiresPerObjectAuthorization() }) {
        let requested = readTypes.allSatisfy {
          UserDefaults.standard.bool(forKey: requestedKey($0))
        }
        result[descriptor.name] = [
          "state": requested ? "requested" : "undetermined", "canAskAgain": !requested,
        ]
        continue
      }
      do {
        let status: HKAuthorizationRequestStatus = try await withCheckedThrowingContinuation {
          continuation in
          store.getRequestStatusForAuthorization(toShare: [], read: readTypes) { status, error in
            if let error {
              continuation.resume(throwing: error)
            } else {
              continuation.resume(returning: status)
            }
          }
        }
        switch status {
        case .shouldRequest:
          result[descriptor.name] = ["state": "undetermined", "canAskAgain": true]
        case .unnecessary: result[descriptor.name] = ["state": "requested", "canAskAgain": false]
        default: result[descriptor.name] = ["state": "error", "canAskAgain": false]
        }
      } catch {
        // A clinical capability failure must not hide unrelated health types.
        result[descriptor.name] = ["state": "error", "canAskAgain": false]
      }
    }
    return result
  }

  private func requestedKey(_ type: HKObjectType) -> String {
    "health.read-selection-requested.\(type.identifier)"
  }

  private func objectType(_ descriptor: HealthTypeRecord) throws -> HKObjectType {
    let version = descriptor.minimumIOS.split(separator: ".").compactMap { Int($0) }
    guard HKHealthStore.isHealthDataAvailable(),
      ProcessInfo.processInfo.isOperatingSystemAtLeast(
        OperatingSystemVersion(
          majorVersion: version.first ?? 99, minorVersion: version.dropFirst().first ?? 0,
          patchVersion: 0
        ))
    else { throw HealthDataException("Unavailable health type: \(descriptor.identifier)") }
    let identifier = descriptor.identifier
    let type: HKObjectType?
    switch descriptor.kind {
    case "quantity":
      type = HKObjectType.quantityType(
        forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier))
    case "category":
      if descriptor.name == "audioExposureEvent"
        || descriptor.name == "environmentalAudioExposureEvent"
      {
        type = HKObjectType.categoryType(forIdentifier: .environmentalAudioExposureEvent)
      } else {
        type = HKObjectType.categoryType(
          forIdentifier: HKCategoryTypeIdentifier(rawValue: identifier))
      }
    case "characteristic":
      type = HKObjectType.characteristicType(
        forIdentifier: HKCharacteristicTypeIdentifier(rawValue: identifier))
    case "correlation":
      type = HKObjectType.correlationType(
        forIdentifier: HKCorrelationTypeIdentifier(rawValue: identifier))
    case "document":
      type = HKObjectType.documentType(
        forIdentifier: HKDocumentTypeIdentifier(rawValue: identifier))
    case "clinical":
      type =
        store.supportsHealthRecords()
        ? HKObjectType.clinicalType(forIdentifier: HKClinicalTypeIdentifier(rawValue: identifier))
        : nil
    case "workout": type = HKObjectType.workoutType()
    case "activitySummary": type = HKObjectType.activitySummaryType()
    case "route": type = HKSeriesType.workoutRoute()
    case "heartbeat": type = HKSeriesType.heartbeat()
    case "electrocardiogram": type = HKObjectType.electrocardiogramType()
    case "audiogram": type = HKObjectType.audiogramSampleType()
    case "vision": type = HKObjectType.visionPrescriptionType()
    case "stateOfMind":
      if #available(iOS 18.0, *) { type = HKObjectType.stateOfMindType() } else { type = nil }
    case "assessment":
      if #available(iOS 18.0, *) {
        type = HKScoredAssessmentType(HKScoredAssessmentTypeIdentifier(rawValue: identifier))
      } else {
        type = nil
      }
    case "medication":
      if #available(iOS 26.0, *) {
        type = HKObjectType.userAnnotatedMedicationType()
      } else {
        type = nil
      }
    case "medicationDoseEvent":
      if #available(iOS 26.0, *) {
        type = HKObjectType.medicationDoseEventType()
      } else {
        type = nil
      }
    default: type = nil
    }
    guard let type else { throw HealthDataException("Unsupported health type: \(identifier)") }
    return type
  }
}

struct HealthTypeRecord: Record {
  @Field var name: String = ""
  @Field var identifier: String = ""
  @Field var kind: String = ""
  @Field var minimumIOS: String = "99.0"
  @Field var authorization: [HealthTypeRecord] = []
}

struct HealthQueryRecord: Record {
  @Field var startDate: String = ""
  @Field var endDate: String = ""
  @Field var limit: Int = 50
  @Field var cursor: String = ""
  @Field var mode: String = "samples"
  @Field var granularity: String = "summary"
  @Field var workoutId: String = ""
}

struct HealthRecordRequest: Record {
  @Field var attachmentId: String = ""
  @Field var id: String = ""
  @Field var offset: Int = 0
  @Field var limit: Int = 1000
}

struct HealthVerifiableRecordRequest: Record {
  @Field var recordTypes: [String] = []
  @Field var sourceTypes: [String] = []
  @Field var offset: Int = 0
  @Field var limit: Int = 20
  @Field var dataOffset: Int = 0
  @Field var dataLimit: Int = 1000
}

class HealthDataException: GenericException<String> {
  override var reason: String { param }
}
