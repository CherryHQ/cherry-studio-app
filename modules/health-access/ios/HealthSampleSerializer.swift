import Foundation
import HealthKit

extension HealthDataReader {
  func serialize(_ sample: HKSample, units: [HKQuantityType: HKUnit]) -> [String: Any] {
    let revision = sample.sourceRevision
    var row: [String: Any] = [
      "id": sample.uuid.uuidString, "identifier": sample.sampleType.identifier,
      "startDate": healthISO(sample.startDate), "endDate": healthISO(sample.endDate),
      "source": [
        "name": revision.source.name, "bundleIdentifier": revision.source.bundleIdentifier,
        "version": revision.version as Any? ?? NSNull(),
        "productType": revision.productType as Any? ?? NSNull(),
      ],
      "metadata": healthJSON(sample.metadata ?? [:]),
    ]
    if let device = sample.device {
      row["device"] = [
        "name": device.name as Any? ?? NSNull(),
        "manufacturer": device.manufacturer as Any? ?? NSNull(),
        "model": device.model as Any? ?? NSNull(),
        "hardwareVersion": device.hardwareVersion as Any? ?? NSNull(),
        "softwareVersion": device.softwareVersion as Any? ?? NSNull(),
        "firmwareVersion": device.firmwareVersion as Any? ?? NSNull(),
      ]
    }
    if let value = sample as? HKQuantitySample {
      row["value"] = units[value.quantityType].map { healthNumber(value.quantity, $0) } ?? NSNull()
      row["unit"] = units[value.quantityType]?.unitString as Any? ?? NSNull()
      row["quantityCount"] = value.count
      row["aggregationStyle"] = value.quantityType.aggregationStyle.rawValue
    } else if let value = sample as? HKCategorySample {
      row["value"] = value.value
    } else if let value = sample as? HKCorrelation {
      row["objects"] = value.objects.sorted { $0.uuid.uuidString < $1.uuid.uuidString }.map {
        serialize($0, units: units)
      }
    } else if let value = sample as? HKWorkout {
      row["activityType"] = value.workoutActivityType.rawValue
      row["durationSeconds"] = value.duration
      row["totalDistanceMeters"] = healthNumber(value.totalDistance, .meter())
      row["totalEnergyKilocalories"] = healthNumber(value.totalEnergyBurned, .kilocalorie())
      row["totalSwimmingStrokeCount"] = healthNumber(value.totalSwimmingStrokeCount, .count())
      row["totalFlightsClimbed"] = healthNumber(value.totalFlightsClimbed, .count())
      row["events"] = (value.workoutEvents ?? []).map(serializeEvent)
      row["statistics"] = serializeWorkoutStatistics(value.allStatistics, units: units)
      row["activities"] = value.workoutActivities.map { activity -> [String: Any] in
        [
          "id": activity.uuid.uuidString,
          "activityType": activity.workoutConfiguration.activityType.rawValue,
          "locationType": activity.workoutConfiguration.locationType.rawValue,
          "swimmingLocationType": activity.workoutConfiguration.swimmingLocationType.rawValue,
          "startDate": healthISO(activity.startDate),
          "endDate": activity.endDate.map(healthISO) as Any? ?? NSNull(),
          "durationSeconds": activity.duration, "metadata": healthJSON(activity.metadata ?? [:]),
          "events": activity.workoutEvents.map(serializeEvent),
          "statistics": serializeWorkoutStatistics(activity.allStatistics, units: units),
        ]
      }
    } else if let value = sample as? HKElectrocardiogram {
      row["classification"] = value.classification.rawValue
      row["symptomsStatus"] = value.symptomsStatus.rawValue
      row["averageHeartRateBPM"] = healthNumber(
        value.averageHeartRate, HKUnit.count().unitDivided(by: .minute()))
      row["samplingFrequencyHz"] = healthNumber(value.samplingFrequency, .hertz())
      row["numberOfVoltageMeasurements"] = value.numberOfVoltageMeasurements
    } else if let value = sample as? HKAudiogramSample {
      row["sensitivityPoints"] = value.sensitivityPoints.map { point -> [String: Any] in
        var result: [String: Any] = ["frequencyHz": point.frequency.doubleValue(for: .hertz())]
        if #available(iOS 18.1, *) {
          result["tests"] = point.tests.map { test -> [String: Any] in
            [
              "sensitivityDBHL": healthNumber(test.sensitivity, .decibelHearingLevel()),
              "conductionType": test.type.rawValue,
              "masked": test.masked, "side": test.side.rawValue,
              "lowerBoundDBHL": test.clampingRange.map {
                healthNumber($0.lowerBound, .decibelHearingLevel())
              } ?? NSNull(),
              "upperBoundDBHL": test.clampingRange.map {
                healthNumber($0.upperBound, .decibelHearingLevel())
              } ?? NSNull(),
            ]
          }
        } else {
          result["leftEarSensitivityDBHL"] = healthNumber(
            point.leftEarSensitivity, .decibelHearingLevel())
          result["rightEarSensitivityDBHL"] = healthNumber(
            point.rightEarSensitivity, .decibelHearingLevel())
        }
        return result
      }
    } else if let value = sample as? HKVisionPrescription {
      row["prescriptionType"] = value.prescriptionType.rawValue
      row["dateIssued"] = healthISO(value.dateIssued)
      row["expirationDate"] = value.expirationDate.map(healthISO) as Any? ?? NSNull()
      if let glasses = value as? HKGlassesPrescription {
        row["leftEye"] = glasses.leftEye.map(serializeLens) as Any? ?? NSNull()
        row["rightEye"] = glasses.rightEye.map(serializeLens) as Any? ?? NSNull()
      }
      if let contacts = value as? HKContactsPrescription {
        row["brand"] = contacts.brand
        row["leftEye"] = contacts.leftEye.map(serializeLens) as Any? ?? NSNull()
        row["rightEye"] = contacts.rightEye.map(serializeLens) as Any? ?? NSNull()
      }
    } else if let value = sample as? HKClinicalRecord {
      row["displayName"] = value.displayName
      if let resource = value.fhirResource {
        row["fhir"] = [
          "identifier": resource.identifier, "resourceType": resource.resourceType.rawValue,
          "sourceURL": resource.sourceURL?.absoluteString as Any? ?? NSNull(),
          "byteCount": resource.data.count,
        ]
      }
    } else if let value = sample as? HKCDADocumentSample, let document = value.document {
      row["document"] = [
        "title": document.title, "patientName": document.patientName,
        "authorName": document.authorName, "custodianName": document.custodianName,
        "byteCount": document.documentData?.count as Any? ?? NSNull(),
      ]
    } else if let value = sample as? HKSeriesSample {
      row["count"] = value.count
    }
    if #available(iOS 18.0, *) {
      if let value = sample as? HKStateOfMind {
        row["kind"] = value.kind.rawValue
        row["valence"] = value.valence
        row["valenceClassification"] = value.valenceClassification.rawValue
        row["labels"] = value.labels.map(\.rawValue)
        row["associations"] = value.associations.map(\.rawValue)
      }
      if let value = sample as? HKScoredAssessment { row["score"] = value.score }
      if let value = sample as? HKGAD7Assessment {
        row["risk"] = value.risk.rawValue
        row["answers"] = value.answers.map(\.rawValue)
      }
      if let value = sample as? HKPHQ9Assessment {
        row["risk"] = value.risk.rawValue
        row["answers"] = value.answers.map(\.rawValue)
      }
    }
    if #available(iOS 26.0, *), let value = sample as? HKMedicationDoseEvent {
      row["conceptIdentifier"] = healthConceptID(value.medicationConceptIdentifier)
      row["scheduledDate"] = value.scheduledDate.map(healthISO) as Any? ?? NSNull()
      row["scheduledDoseQuantity"] = value.scheduledDoseQuantity as Any? ?? NSNull()
      row["doseQuantity"] = value.doseQuantity as Any? ?? NSNull()
      row["unit"] = value.unit.unitString
      row["logStatus"] = value.logStatus.rawValue
      row["scheduleType"] = value.scheduleType.rawValue
    }
    return row
  }

  private func serializeWorkoutStatistics(
    _ statistics: [HKQuantityType: HKStatistics], units: [HKQuantityType: HKUnit]
  ) -> [[String: Any]] {
    statistics.sorted { $0.key.identifier < $1.key.identifier }.map { type, stats in
      guard let unit = units[type] else {
        return ["identifier": type.identifier, "error": "No preferred unit"]
      }
      return ["identifier": type.identifier, "statistics": serializeStatistics(stats, unit: unit)]
    }
  }

  private func serializeEvent(_ event: HKWorkoutEvent) -> [String: Any] {
    [
      "type": event.type.rawValue, "startDate": healthISO(event.dateInterval.start),
      "endDate": healthISO(event.dateInterval.end), "metadata": healthJSON(event.metadata ?? [:]),
    ]
  }

  private func serializeLens(_ lens: HKLensSpecification) -> [String: Any] {
    let mm = HKUnit.meterUnit(with: .milli)
    var result: [String: Any] = [
      "sphereDiopters": healthNumber(lens.sphere, .diopter()),
      "cylinderDiopters": healthNumber(lens.cylinder, .diopter()),
      "axisDegrees": healthNumber(lens.axis, .degreeAngle()),
      "addPowerDiopters": healthNumber(lens.addPower, .diopter()),
    ]
    if let lens = lens as? HKContactsLensSpecification {
      result["baseCurveMillimeters"] = healthNumber(lens.baseCurve, mm)
      result["diameterMillimeters"] = healthNumber(lens.diameter, mm)
    }
    if let lens = lens as? HKGlassesLensSpecification {
      result["vertexDistanceMillimeters"] = healthNumber(lens.vertexDistance, mm)
      result["farPupillaryDistanceMillimeters"] = healthNumber(lens.farPupillaryDistance, mm)
      result["nearPupillaryDistanceMillimeters"] = healthNumber(lens.nearPupillaryDistance, mm)
      if let prism = lens.prism {
        result["prism"] = [
          "amountPrismDiopters": healthNumber(prism.amount, .prismDiopter()),
          "angleDegrees": healthNumber(prism.angle, .degreeAngle()),
          "verticalAmountPrismDiopters": healthNumber(prism.verticalAmount, .prismDiopter()),
          "horizontalAmountPrismDiopters": healthNumber(prism.horizontalAmount, .prismDiopter()),
          "verticalBase": prism.verticalBase.rawValue,
          "horizontalBase": prism.horizontalBase.rawValue, "eye": prism.eye.rawValue,
        ]
      }
    }
    return result
  }
}

/// Preserve metadata's shape without passing native objects or non-finite numbers over the bridge.
func healthJSON(_ value: Any) -> Any {
  switch value {
  case let date as Date: return healthISO(date)
  case let url as URL: return url.absoluteString
  case let uuid as UUID: return uuid.uuidString
  case let quantity as HKQuantity: return ["quantityDescription": quantity.description]
  case let number as NSNumber: return number.doubleValue.isFinite ? number : NSNull()
  case let string as String: return string
  case let values as [String: Any]: return values.mapValues(healthJSON)
  case let values as [Any]: return values.map(healthJSON)
  case let data as Data: return ["encoding": "base64", "data": data.base64EncodedString()]
  default: return NSNull()
  }
}
