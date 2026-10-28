import Foundation
import HealthKit

final class HealthDataReader {
  let store: HKHealthStore
  init(store: HKHealthStore) { self.store = store }

  func workouts(start: Date, end: Date, limit: Int) async throws -> [[String: Any]] {
    guard start < end, end.timeIntervalSince(start) <= 90 * 86400, (1...51).contains(limit) else {
      throw HealthDataException("Invalid workout range or limit")
    }
    let samples: [HKSample] = try await execute { finish in
      HKSampleQuery(
        sampleType: HKObjectType.workoutType(),
        predicate: HKQuery.predicateForSamples(withStart: start, end: end, options: []),
        limit: limit,
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
      ) { _, samples, error in
        if let error { finish(.failure(error)) } else { finish(.success(samples ?? [])) }
      }
    }
    return samples.compactMap { sample in
      guard let workout = sample as? HKWorkout else { return nil }
      return [
        "id": workout.uuid.uuidString, "activityType": workout.workoutActivityType.rawValue,
        "durationSeconds": workout.duration,
        "startDate": healthISO(workout.startDate), "endDate": healthISO(workout.endDate),
        "totalDistanceMeters": healthNumber(workout.totalDistance, .meter()),
        "totalEnergyKilocalories": healthNumber(workout.totalEnergyBurned, .kilocalorie()),
      ]
    }
  }

  func query(_ type: HKObjectType, options: HealthQueryRecord) async throws -> [String: Any] {
    let start = try healthDate(options.startDate)
    let end = try healthDate(options.endDate)
    guard start < end, end.timeIntervalSince(start) <= 90 * 86400,
      (1...200).contains(options.limit)
    else { throw HealthDataException("Invalid health query range or limit") }
    if type is HKCharacteristicType { return try characteristic(type.identifier) }
    if type is HKActivitySummaryType { return try await activitySummaries(start: start, end: end) }
    if #available(iOS 26.0, *), type is HKUserAnnotatedMedicationType {
      return try await medications(options: options)
    }
    guard let sampleType = type as? HKSampleType else {
      throw HealthDataException("Unsupported sample type")
    }
    var predicates = [HKQuery.predicateForSamples(withStart: start, end: end, options: [])]
    if !options.workoutId.isEmpty {
      guard
        let workout = try await sample(HKObjectType.workoutType(), id: options.workoutId)
          as? HKWorkout
      else {
        throw HealthDataException("Workout not found or not readable")
      }
      predicates.append(HKQuery.predicateForObjects(from: workout))
    }
    let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
    if options.mode == "statistics" {
      guard let quantityType = type as? HKQuantityType else {
        throw HealthDataException(
          "Statistics require a quantity type; use samples for other types")
      }
      return try await statistics(
        quantityType, predicate: predicate, start: start, end: end,
        daily: options.granularity == "day", fixedUnit: options.unit)
    }
    let anchor = try readAnchor(options.cursor, type: type.identifier, options: options)
    let page: ([HKSample], [HKDeletedObject], HKQueryAnchor?) = try await execute { finish in
      HKAnchoredObjectQuery(
        type: sampleType, predicate: predicate, anchor: anchor, limit: options.limit
      ) { _, samples, deleted, next, error in
        if let error {
          finish(.failure(error))
        } else {
          finish(.success((samples ?? [], deleted ?? [], next)))
        }
      }
    }
    let units = try await preferredUnits(for: page.0)
    let hasMore = page.0.count + page.1.count >= options.limit
    let next = try page.2.map { try writeAnchor($0, type: type.identifier, options: options) }
    return [
      "data": page.0.map { serialize($0, units: units) },
      "deletedIds": page.1.map { $0.uuid.uuidString },
      "hasMore": hasMore,
      "nextCursor": hasMore ? (next as Any? ?? NSNull()) : NSNull(),
      "order": "HealthKit anchored-query order; not chronological",
      "paginationNote":
        "hasMore may require a final empty page. Keep type, dates and workoutId unchanged when continuing.",
    ]
  }

  func sample(_ type: HKSampleType, id: String) async throws -> HKSample? {
    guard let uuid = UUID(uuidString: id) else {
      throw HealthDataException("Invalid health record UUID")
    }
    return try await execute { finish in
      HKSampleQuery(
        sampleType: type, predicate: HKQuery.predicateForObject(with: uuid), limit: 1,
        sortDescriptors: nil
      ) { _, samples, error in
        if let error { finish(.failure(error)) } else { finish(.success(samples?.first)) }
      }
    }
  }

  func preferredUnits(for samples: [HKSample]) async throws -> [HKQuantityType: HKUnit] {
    var types = Set<HKQuantityType>()
    func collect(_ sample: HKSample) {
      if let quantity = sample as? HKQuantitySample { types.insert(quantity.quantityType) }
      if let correlation = sample as? HKCorrelation { correlation.objects.forEach(collect) }
      if let workout = sample as? HKWorkout {
        types.formUnion(workout.allStatistics.keys)
        workout.workoutActivities.forEach { types.formUnion($0.allStatistics.keys) }
      }
    }
    samples.forEach(collect)
    return try await units(for: types)
  }

  func units(for types: Set<HKQuantityType>) async throws -> [HKQuantityType: HKUnit] {
    guard !types.isEmpty else { return [:] }
    return try await store.preferredUnits(for: types)
  }

  private func statistics(
    _ type: HKQuantityType, predicate: NSPredicate, start: Date, end: Date, daily: Bool,
    fixedUnit: String
  ) async throws -> [String: Any] {
    let resolvedUnit: HKUnit?
    if fixedUnit.isEmpty {
      resolvedUnit = try await units(for: [type])[type]
    } else {
      resolvedUnit = healthUnit(fixedUnit, compatibleWith: type)
    }
    guard let unit = resolvedUnit else {
      throw HealthDataException("HealthKit returned no compatible unit")
    }
    let cumulative = type.aggregationStyle == .cumulative
    let options: HKStatisticsOptions =
      cumulative
      ? [.cumulativeSum, .mostRecent] : [.discreteAverage, .discreteMin, .discreteMax, .mostRecent]
    if !daily {
      let stats: HKStatistics? = try await execute { finish in
        HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: options)
        { _, result, error in
          if let error = error as? HKError, error.code == .errorNoData {
            finish(.success(nil))
          } else if let error {
            finish(.failure(error))
          } else {
            finish(.success(result))
          }
        }
      }
      return [
        "data": stats.map { serializeStatistics($0, unit: unit) } as Any? ?? NSNull(),
        "unit": unit.unitString, "aggregationStyle": type.aggregationStyle.rawValue,
      ]
    }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let anchor = calendar.startOfDay(for: start)
    let collection: HKStatisticsCollection? = try await execute { finish in
      let query = HKStatisticsCollectionQuery(
        quantityType: type, quantitySamplePredicate: predicate, options: options,
        anchorDate: anchor, intervalComponents: DateComponents(day: 1))
      query.initialResultsHandler = { _, result, error in
        if let error = error as? HKError, error.code == .errorNoData {
          finish(.success(nil))
        } else if let error {
          finish(.failure(error))
        } else {
          finish(.success(result))
        }
      }
      return query
    }
    var days: [[String: Any]] = []
    collection?.enumerateStatistics(from: start, to: end.addingTimeInterval(-0.001)) { stats, _ in
      var row = self.serializeStatistics(stats, unit: unit)
      row["date"] = healthDay(stats.startDate)
      days.append(row)
    }
    return [
      "data": days, "unit": unit.unitString, "aggregationStyle": type.aggregationStyle.rawValue,
      "timeZone": TimeZone.current.identifier,
    ]
  }

  func serializeStatistics(_ stats: HKStatistics, unit: HKUnit) -> [String: Any] {
    var result: [String: Any] = [
      "startDate": healthISO(stats.startDate), "endDate": healthISO(stats.endDate),
      "unit": unit.unitString,
      "mostRecent": healthNumber(stats.mostRecentQuantity(), unit),
      "sources": (stats.sources ?? []).map {
        ["name": $0.name, "bundleIdentifier": $0.bundleIdentifier]
      },
    ]
    if stats.quantityType.aggregationStyle == .cumulative {
      result["sum"] = healthNumber(stats.sumQuantity(), unit)
    } else {
      result["average"] = healthNumber(stats.averageQuantity(), unit)
      result["minimum"] = healthNumber(stats.minimumQuantity(), unit)
      result["maximum"] = healthNumber(stats.maximumQuantity(), unit)
    }
    if let interval = stats.mostRecentQuantityDateInterval() {
      result["mostRecentInterval"] = [
        "startDate": healthISO(interval.start), "endDate": healthISO(interval.end),
      ]
    }
    return result
  }

  private func characteristic(_ identifier: String) throws -> [String: Any] {
    do {
      let value: Any
      switch identifier {
      case HKCharacteristicTypeIdentifier.dateOfBirth.rawValue:
        let date = try store.dateOfBirthComponents()
        value = [
          "year": date.year as Any? ?? NSNull(), "month": date.month as Any? ?? NSNull(),
          "day": date.day as Any? ?? NSNull(),
        ]
      case HKCharacteristicTypeIdentifier.biologicalSex.rawValue:
        value = try store.biologicalSex().biologicalSex.rawValue
      case HKCharacteristicTypeIdentifier.bloodType.rawValue:
        value = try store.bloodType().bloodType.rawValue
      case HKCharacteristicTypeIdentifier.fitzpatrickSkinType.rawValue:
        value = try store.fitzpatrickSkinType().skinType.rawValue
      case HKCharacteristicTypeIdentifier.wheelchairUse.rawValue:
        value = try store.wheelchairUse().wheelchairUse.rawValue
      case HKCharacteristicTypeIdentifier.activityMoveMode.rawValue:
        value = try store.activityMoveMode().activityMoveMode.rawValue
      default: throw HealthDataException("Unsupported health characteristic")
      }
      return ["data": value, "dateRangeApplies": false]
    } catch let error as HKError where error.code == .errorNoData {
      return ["data": NSNull(), "dateRangeApplies": false]
    }
  }

  private func activitySummaries(start: Date, end: Date) async throws -> [String: Any] {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let startComponents = calendar.dateComponents(
      [.calendar, .era, .year, .month, .day], from: start)
    let endComponents = calendar.dateComponents(
      [.calendar, .era, .year, .month, .day], from: end.addingTimeInterval(-0.001))
    let predicate = HKQuery.predicate(
      forActivitySummariesBetweenStart: startComponents, end: endComponents)
    let summaries: [HKActivitySummary] = try await execute { finish in
      HKActivitySummaryQuery(predicate: predicate) { _, result, error in
        if let error { finish(.failure(error)) } else { finish(.success(result ?? [])) }
      }
    }
    return [
      "data": summaries.map { summary -> [String: Any] in
        let date = calendar.date(from: summary.dateComponents(for: calendar))
        var row: [String: Any] = [
          "date": date.map(healthDay) as Any? ?? NSNull(),
          "activityMoveMode": summary.activityMoveMode.rawValue,
          "activeEnergyKilocalories": summary.activeEnergyBurned.doubleValue(for: .kilocalorie()),
          "activeEnergyGoalKilocalories": summary.activeEnergyBurnedGoal.doubleValue(
            for: .kilocalorie()),
          "moveMinutes": summary.appleMoveTime.doubleValue(for: .minute()),
          "moveGoalMinutes": summary.appleMoveTimeGoal.doubleValue(for: .minute()),
          "exerciseMinutes": summary.appleExerciseTime.doubleValue(for: .minute()),
          "exerciseGoalMinutes": healthNumber(summary.exerciseTimeGoal, .minute()),
          "standHours": summary.appleStandHours.doubleValue(for: .count()),
          "standGoalHours": healthNumber(summary.standHoursGoal, .count()),
        ]
        if #available(iOS 18.0, *) { row["isPaused"] = summary.isPaused }
        return row
      }, "timeZone": TimeZone.current.identifier,
      "intervalNote":
        "Activity rings cover whole local calendar days; partial days are not prorated.",
    ]
  }

  @available(iOS 26.0, *)
  private func medications(options: HealthQueryRecord) async throws -> [String: Any] {
    let offset = options.cursor.isEmpty ? 0 : Int(options.cursor)
    guard let offset, offset >= 0 else { throw HealthDataException("Invalid medication cursor") }
    var medications: [HKUserAnnotatedMedication] = []
    let values: [HKUserAnnotatedMedication] = try await execute { finish in
      HKUserAnnotatedMedicationQuery(predicate: nil, limit: HKObjectQueryNoLimit) {
        _, value, done, error in
        if let error {
          finish(.failure(error))
          return
        }
        if let value { medications.append(value) }
        if done { finish(.success(medications)) }
      }
    }
    let rows = values.map { medication -> [String: Any] in
      [
        "nickname": medication.nickname as Any? ?? NSNull(), "isArchived": medication.isArchived,
        "hasSchedule": medication.hasSchedule, "displayText": medication.medication.displayText,
        "conceptIdentifier": healthConceptID(medication.medication.identifier),
        "generalForm": medication.medication.generalForm.rawValue,
        "relatedCodings": medication.medication.relatedCodings.map {
          ["system": $0.system, "version": $0.version as Any? ?? NSNull(), "code": $0.code]
        },
      ]
    }.sorted {
      String(describing: $0["conceptIdentifier"] ?? "")
        < String(describing: $1["conceptIdentifier"] ?? "")
    }
    let page = Array(rows.dropFirst(offset).prefix(options.limit))
    let hasMore = offset + page.count < rows.count
    return [
      "data": page, "hasMore": hasMore,
      "nextCursor": hasMore ? String(offset + page.count) as Any : NSNull(),
      "dateRangeApplies": false,
      "paginationNote":
        "Current medication list, including archived entries. Restart pagination if medications change.",
    ]
  }

  private struct AnchorEnvelope: Codable {
    let type: String
    let start: String
    let end: String
    let workout: String
    let anchor: Data
  }

  private func readAnchor(_ cursor: String, type: String, options: HealthQueryRecord) throws
    -> HKQueryAnchor?
  {
    guard !cursor.isEmpty else { return nil }
    guard cursor.count <= 16000, let data = Data(base64Encoded: cursor),
      let envelope = try? JSONDecoder().decode(AnchorEnvelope.self, from: data),
      envelope.type == type, envelope.start == options.startDate, envelope.end == options.endDate,
      envelope.workout == options.workoutId,
      let anchor = try NSKeyedUnarchiver.unarchivedObject(
        ofClass: HKQueryAnchor.self, from: envelope.anchor)
    else { throw HealthDataException("Invalid health cursor or changed query range") }
    return anchor
  }

  private func writeAnchor(_ anchor: HKQueryAnchor, type: String, options: HealthQueryRecord) throws
    -> String
  {
    let data = try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
    return try JSONEncoder().encode(
      AnchorEnvelope(
        type: type, start: options.startDate, end: options.endDate, workout: options.workoutId,
        anchor: data)
    ).base64EncodedString()
  }

  /// Stops every query on completion or timeout and prevents callbacks from resuming twice.
  func execute<T>(_ makeQuery: (@escaping (Result<T, Error>) -> Void) -> HKQuery)
    async throws -> T
  {
    try await withCheckedThrowingContinuation { continuation in
      let lock = NSLock()
      var finished = false
      var query: HKQuery?
      var timer: DispatchWorkItem?
      let finish: (Result<T, Error>) -> Void = { result in
        lock.lock()
        guard !finished else {
          lock.unlock()
          return
        }
        finished = true
        let activeQuery = query
        let activeTimer = timer
        query = nil
        timer = nil
        lock.unlock()
        activeTimer?.cancel()
        if let activeQuery { self.store.stop(activeQuery) }
        continuation.resume(with: result)
      }
      query = makeQuery(finish)
      timer = DispatchWorkItem {
        finish(.failure(HealthDataException("HealthKit query timed out")))
      }
      if let timer { DispatchQueue.global().asyncAfter(deadline: .now() + 20, execute: timer) }
      if let query { store.execute(query) }
    }
  }
}

func healthISO(_ date: Date) -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter.string(from: date)
}
/// Only app-chosen unit strings reach here; an unknown one is rejected instead of raising.
private let fixedHealthUnits: [String: HKUnit] = [
  "count": .count(), "count/min": .count().unitDivided(by: .minute()), "kcal": .kilocalorie(),
  "m": .meter(), "ms": .secondUnit(with: .milli),
]
func healthUnit(_ value: String, compatibleWith type: HKQuantityType) -> HKUnit? {
  guard let unit = fixedHealthUnits[value], type.is(compatibleWith: unit) else { return nil }
  return unit
}
func healthDay(_ date: Date) -> String {
  let formatter = DateFormatter()
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.timeZone = .current
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter.string(from: date)
}
func healthDate(_ value: String) throws -> Date {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  guard let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value) else {
    throw HealthDataException("Invalid ISO health query date")
  }
  return date
}
func healthNumber(_ quantity: HKQuantity?, _ unit: HKUnit) -> Any {
  guard let quantity, quantity.is(compatibleWith: unit) else { return NSNull() }
  let value = quantity.doubleValue(for: unit)
  return value.isFinite ? value as Any : NSNull()
}
@available(iOS 26.0, *)
func healthConceptID(_ identifier: HKHealthConceptIdentifier) -> String {
  // Public identifiers are opaque NSSecureCoding objects, not strings.
  ((try? NSKeyedArchiver.archivedData(withRootObject: identifier, requiringSecureCoding: true))
    ?? Data()).base64EncodedString()
}
