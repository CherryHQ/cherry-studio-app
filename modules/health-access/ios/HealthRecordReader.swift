import CoreLocation
import Foundation
import HealthKit

extension HealthDataReader {
  func record(_ type: HKObjectType, options: HealthRecordRequest) async throws -> [String: Any] {
    guard let sampleType = type as? HKSampleType,
      options.offset >= 0, (1...10_000).contains(options.limit)
    else {
      throw HealthDataException("Invalid record type, offset or limit")
    }
    guard let sample = try await sample(sampleType, id: options.id) else {
      return ["data": NSNull(), "accessNote": "Record not found or not readable"]
    }
    let units = try await preferredUnits(for: [sample])
    var result: [String: Any] = ["data": serialize(sample, units: units)]
    let attachments = HKAttachmentStore(healthStore: store)
    if !options.attachmentId.isEmpty {
      let available = try await attachments.attachments(for: sample)
      guard
        let attachment = available.first(where: { $0.identifier.uuidString == options.attachmentId }
        )
      else {
        throw HealthDataException("Attachment not found or not readable for this record")
      }
      let reader = attachments.dataReader(for: attachment)
      let timeout = DispatchWorkItem { reader.progress.cancel() }
      DispatchQueue.global().asyncAfter(deadline: .now() + 20, execute: timeout)
      defer {
        timeout.cancel()
        reader.progress.cancel()
      }
      var bytes = Data()
      var index = 0
      for try await byte in reader.bytes {
        if index >= options.offset { bytes.append(byte) }
        index += 1
        if bytes.count >= options.limit { break }
      }
      result["attachment"] = [
        "id": attachment.identifier.uuidString, "name": attachment.name,
        "contentType": attachment.contentType.identifier, "encoding": "base64",
        "data": bytes.base64EncodedString(),
        "offset": options.offset, "byteCount": attachment.size,
        "nextOffset": options.offset + bytes.count < attachment.size
          ? (options.offset + bytes.count) as Any : NSNull(),
      ]
      return result
    }
    if let ecg = sample as? HKElectrocardiogram {
      result["series"] = try await electrocardiogram(ecg, options: options)
    } else if let heartbeat = sample as? HKHeartbeatSeriesSample {
      result["series"] = try await heartbeats(heartbeat, options: options)
    } else if let route = sample as? HKWorkoutRoute {
      result["series"] = try await routePoints(route, options: options)
    } else if let quantity = sample as? HKQuantitySample, let unit = units[quantity.quantityType] {
      result["series"] = try await quantities(quantity, unit: unit, options: options)
    }
    do {
      result["attachments"] = try await attachments.attachments(for: sample).map { attachment in
        [
          "id": attachment.identifier.uuidString, "name": attachment.name,
          "contentType": attachment.contentType.identifier,
          "byteCount": attachment.size, "creationDate": healthISO(attachment.creationDate),
          "metadata": healthJSON(attachment.metadata ?? [:]),
        ]
      }
    } catch {
      // Not every HealthKit sample type supports attachments. Keep the readable record.
      result["attachmentsError"] = error.localizedDescription
    }
    return result
  }

  private func electrocardiogram(_ sample: HKElectrocardiogram, options: HealthRecordRequest)
    async throws -> [String: Any]
  {
    let page = HealthPointPage(options)
    return try await execute { finish in
      HKElectrocardiogramQuery(sample) { _, result in
        switch result {
        case .measurement(let value):
          let point: [String: Any] = [
            "timeSinceStartSeconds": value.timeSinceSampleStart,
            "voltageMicrovolts": healthNumber(
              value.quantity(for: .appleWatchSimilarToLeadI), .voltUnit(with: .micro)),
          ]
          if page.append(point) { finish(.success(page.result)) }
        case .done: finish(.success(page.result))
        case .error(let error): finish(.failure(error))
        @unknown default:
          finish(.failure(HealthDataException("Unknown electrocardiogram query result")))
        }
      }
    }
  }

  private func heartbeats(_ sample: HKHeartbeatSeriesSample, options: HealthRecordRequest)
    async throws -> [String: Any]
  {
    let page = HealthPointPage(options)
    return try await execute { finish in
      HKHeartbeatSeriesQuery(heartbeatSeries: sample) { _, time, precededByGap, done, error in
        if let error {
          finish(.failure(error))
          return
        }
        // HealthKit can mark the final heartbeat itself as done.
        if page.append(["timeSinceStartSeconds": time, "precededByGap": precededByGap]) || done {
          finish(.success(page.result))
        }
      }
    }
  }

  private func routePoints(_ route: HKWorkoutRoute, options: HealthRecordRequest) async throws
    -> [String: Any]
  {
    let page = HealthPointPage(options)
    return try await execute { finish in
      HKWorkoutRouteQuery(route: route) { _, locations, done, error in
        if let error {
          finish(.failure(error))
          return
        }
        for location in locations ?? [] {
          let point: [String: Any] = [
            "timestamp": healthISO(location.timestamp),
            "latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude,
            "altitudeMeters": location.verticalAccuracy >= 0 ? location.altitude as Any : NSNull(),
            "horizontalAccuracyMeters": location.horizontalAccuracy >= 0
              ? location.horizontalAccuracy as Any : NSNull(),
            "verticalAccuracyMeters": location.verticalAccuracy >= 0
              ? location.verticalAccuracy as Any : NSNull(),
            "speedMetersPerSecond": location.speed >= 0 ? location.speed as Any : NSNull(),
            "courseDegrees": location.course >= 0 ? location.course as Any : NSNull(),
          ]
          if page.append(point) {
            finish(.success(page.result))
            return
          }
        }
        if done { finish(.success(page.result)) }
      }
    }
  }

  private func quantities(_ sample: HKQuantitySample, unit: HKUnit, options: HealthRecordRequest)
    async throws -> [String: Any]
  {
    let page = HealthPointPage(options)
    return try await execute { finish in
      HKQuantitySeriesSampleQuery(
        quantityType: sample.quantityType, predicate: HKQuery.predicateForObject(with: sample.uuid)
      ) { _, quantity, interval, _, done, error in
        if let error {
          finish(.failure(error))
          return
        }
        if let quantity, let interval {
          if page.append([
            "startDate": healthISO(interval.start), "endDate": healthISO(interval.end),
            "value": healthNumber(quantity, unit), "unit": unit.unitString,
          ]) {
            finish(.success(page.result))
            return
          }
        }
        if done { finish(.success(page.result)) }
      }
    }
  }
}

private final class HealthPointPage {
  private let options: HealthRecordRequest
  private var index = 0
  private var points: [[String: Any]] = []
  private var hasMore = false
  init(_ options: HealthRecordRequest) { self.options = options }
  /// Returns true only after observing another point beyond the requested page.
  func append(_ point: [String: Any]) -> Bool {
    defer { index += 1 }
    guard index >= options.offset else { return false }
    guard points.count < options.limit else {
      hasMore = true
      return true
    }
    points.append(point)
    return false
  }
  var result: [String: Any] {
    [
      "data": points, "offset": options.offset, "hasMore": hasMore,
      "nextOffset": hasMore ? (options.offset + points.count) as Any : NSNull(),
    ]
  }
}
