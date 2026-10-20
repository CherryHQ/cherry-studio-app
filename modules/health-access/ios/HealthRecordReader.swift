import CoreLocation
import Foundation
import HealthKit

extension HealthDataReader {
  func verifiableRecords(_ options: HealthVerifiableRecordRequest) async throws -> [String: Any] {
    let credentials: [String: HKVerifiableClinicalRecordCredentialType] = [
      "covid19": .covid19, "immunization": .immunization,
      "laboratory": .laboratory, "recovery": .recovery,
    ]
    let sources: [String: HKVerifiableClinicalRecordSourceType] = [
      "smartHealthCard": .smartHealthCard, "euDigitalCOVIDCertificate": .euDigitalCOVIDCertificate,
    ]
    guard !options.recordTypes.isEmpty, !options.sourceTypes.isEmpty,
      options.recordTypes.allSatisfy({ credentials[$0] != nil }),
      options.sourceTypes.allSatisfy({ sources[$0] != nil }),
      options.offset >= 0, options.dataOffset >= 0,
      (1...50).contains(options.limit), (1...10_000).contains(options.dataLimit)
    else { throw HealthDataException("Invalid verifiable health record query") }
    let records: [HKVerifiableClinicalRecord] = try await execute(timeout: 180) { finish in
      HKVerifiableClinicalRecordQuery(
        recordTypes: options.recordTypes.compactMap { credentials[$0]?.rawValue },
        sourceTypes: options.sourceTypes.compactMap { sources[$0] }, predicate: nil
      ) { _, records, error in
        if let error = error as? HKError, error.code == .errorAuthorizationDenied {
          finish(
            .failure(
              HealthDataException(
                "Verifiable health record access denied. This API requires Apple's restricted entitlement in the signing profile and one-time user sharing consent."
              )))
        } else if let error {
          finish(.failure(error))
        } else {
          finish(.success(records ?? []))
        }
      }
    }
    let ordered = records.sorted { $0.uuid.uuidString < $1.uuid.uuidString }
    let page = ordered.dropFirst(options.offset).prefix(options.limit)
    let next = options.offset + page.count
    return [
      "data": page.map { record -> [String: Any] in
        let payload = record.dataRepresentation
        let start = min(options.dataOffset, payload.count)
        let end = start + min(options.dataLimit, payload.count - start)
        var row = serialize(record, units: [:])
        row["recordTypes"] = record.recordTypes
        row["sourceType"] = record.sourceType?.rawValue as Any? ?? NSNull()
        row["issuerIdentifier"] = record.issuerIdentifier
        row["itemNames"] = record.itemNames
        row["issuedDate"] = healthISO(record.issuedDate)
        row["relevantDate"] = healthISO(record.relevantDate)
        row["expirationDate"] = record.expirationDate.map(healthISO) as Any? ?? NSNull()
        let birth = record.subject.dateOfBirthComponents
        row["subject"] = [
          "fullName": record.subject.fullName,
          "dateOfBirth": [
            "year": birth?.year as Any? ?? NSNull(),
            "month": birth?.month as Any? ?? NSNull(), "day": birth?.day as Any? ?? NSNull(),
          ],
        ]
        row["content"] = [
          "encoding": "base64", "data": payload.subdata(in: start..<end).base64EncodedString(),
          "offset": start, "byteCount": payload.count,
          "nextOffset": end < payload.count ? end as Any : NSNull(),
        ]
        return row
      },
      "selectedCount": records.count, "hasMore": next < records.count,
      "nextOffset": next < records.count ? next as Any : NSNull(),
      "note":
        "Each call opens Apple's one-time selection sheet. To continue a page, select the same records again; changed selections require restarting offsets. Credential type filters are combined with AND. Payload is the original signed representation; this tool does not validate its signature or issuer.",
    ]
  }

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
    } else if let clinical = sample as? HKClinicalRecord, let resource = clinical.fhirResource {
      result["content"] = healthTextPage(resource.data, format: "FHIR JSON", options: options)
    } else if let documentType = type as? HKDocumentType {
      guard let uuid = UUID(uuidString: options.id) else {
        throw HealthDataException("Invalid document UUID")
      }
      var documents: [HKDocumentSample] = []
      // A document query can present Apple's per-document selection sheet.
      let values: [HKDocumentSample] = try await execute(timeout: 180) { finish in
        HKDocumentQuery(
          documentType: documentType, predicate: HKQuery.predicateForObject(with: uuid), limit: 1,
          sortDescriptors: nil, includeDocumentData: true
        ) { _, samples, done, error in
          if let error {
            finish(.failure(error))
            return
          }
          documents.append(contentsOf: samples ?? [])
          if done { finish(.success(documents)) }
        }
      }
      if let document = values.first as? HKCDADocumentSample {
        result["data"] = serialize(document, units: [:])
        if let data = document.document?.documentData {
          result["content"] = healthTextPage(data, format: "CDA XML", options: options)
        }
      } else {
        result["content"] = NSNull()
      }
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

private func healthTextPage(_ data: Data, format: String, options: HealthRecordRequest) -> [String:
  Any]
{
  let text = String(decoding: data, as: UTF8.self)
  let characters = text.unicodeScalars
  let offset = min(options.offset, characters.count)
  let start = characters.index(characters.startIndex, offsetBy: offset)
  let end = characters.index(start, offsetBy: min(options.limit, characters.count - offset))
  let next = offset + characters.distance(from: start, to: end)
  return [
    "format": format, "text": String(characters[start..<end]), "offsetUnit": "Unicode scalar",
    "offset": offset, "totalLength": characters.count, "hasMore": end != characters.endIndex,
    "nextOffset": end != characters.endIndex ? next as Any : NSNull(),
  ]
}
