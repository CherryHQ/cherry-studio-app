/** Public HealthKit identifiers from the iOS 27.1 SDK; availability is checked on device.
 * https://developer.apple.com/documentation/healthkit/data-types
 * Read access is per type. An empty query never establishes that access was granted.
 */
export const HEALTH_TYPE_CATALOG = {
  appleSleepingWristTemperature: {
    identifier: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  bodyFatPercentage: {
    identifier: 'HKQuantityTypeIdentifierBodyFatPercentage',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  bodyMass: { identifier: 'HKQuantityTypeIdentifierBodyMass', kind: 'quantity', minimumIOS: '8.0' },
  bodyMassIndex: {
    identifier: 'HKQuantityTypeIdentifierBodyMassIndex',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  electrodermalActivity: {
    identifier: 'HKQuantityTypeIdentifierElectrodermalActivity',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  height: { identifier: 'HKQuantityTypeIdentifierHeight', kind: 'quantity', minimumIOS: '8.0' },
  leanBodyMass: {
    identifier: 'HKQuantityTypeIdentifierLeanBodyMass',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  waistCircumference: {
    identifier: 'HKQuantityTypeIdentifierWaistCircumference',
    kind: 'quantity',
    minimumIOS: '11.0',
  },
  activeEnergy: {
    identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  appleExerciseTime: {
    identifier: 'HKQuantityTypeIdentifierAppleExerciseTime',
    kind: 'quantity',
    minimumIOS: '9.3',
  },
  appleMoveTime: {
    identifier: 'HKQuantityTypeIdentifierAppleMoveTime',
    kind: 'quantity',
    minimumIOS: '14.5',
  },
  appleStandTime: {
    identifier: 'HKQuantityTypeIdentifierAppleStandTime',
    kind: 'quantity',
    minimumIOS: '13.0',
  },
  basalEnergyBurned: {
    identifier: 'HKQuantityTypeIdentifierBasalEnergyBurned',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  crossCountrySkiingSpeed: {
    identifier: 'HKQuantityTypeIdentifierCrossCountrySkiingSpeed',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  cyclingCadence: {
    identifier: 'HKQuantityTypeIdentifierCyclingCadence',
    kind: 'quantity',
    minimumIOS: '17.0',
  },
  cyclingFunctionalThresholdPower: {
    identifier: 'HKQuantityTypeIdentifierCyclingFunctionalThresholdPower',
    kind: 'quantity',
    minimumIOS: '17.0',
  },
  cyclingPower: {
    identifier: 'HKQuantityTypeIdentifierCyclingPower',
    kind: 'quantity',
    minimumIOS: '17.0',
  },
  cyclingSpeed: {
    identifier: 'HKQuantityTypeIdentifierCyclingSpeed',
    kind: 'quantity',
    minimumIOS: '17.0',
  },
  distanceCrossCountrySkiing: {
    identifier: 'HKQuantityTypeIdentifierDistanceCrossCountrySkiing',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  distanceCycling: {
    identifier: 'HKQuantityTypeIdentifierDistanceCycling',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  distanceDownhillSnowSports: {
    identifier: 'HKQuantityTypeIdentifierDistanceDownhillSnowSports',
    kind: 'quantity',
    minimumIOS: '11.2',
  },
  distancePaddleSports: {
    identifier: 'HKQuantityTypeIdentifierDistancePaddleSports',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  distanceRowing: {
    identifier: 'HKQuantityTypeIdentifierDistanceRowing',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  distanceSkatingSports: {
    identifier: 'HKQuantityTypeIdentifierDistanceSkatingSports',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  distanceSwimming: {
    identifier: 'HKQuantityTypeIdentifierDistanceSwimming',
    kind: 'quantity',
    minimumIOS: '10.0',
  },
  distance: {
    identifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  distanceWheelchair: {
    identifier: 'HKQuantityTypeIdentifierDistanceWheelchair',
    kind: 'quantity',
    minimumIOS: '10.0',
  },
  estimatedWorkoutEffortScore: {
    identifier: 'HKQuantityTypeIdentifierEstimatedWorkoutEffortScore',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  flightsClimbed: {
    identifier: 'HKQuantityTypeIdentifierFlightsClimbed',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  nikeFuel: { identifier: 'HKQuantityTypeIdentifierNikeFuel', kind: 'quantity', minimumIOS: '8.0' },
  paddleSportsSpeed: {
    identifier: 'HKQuantityTypeIdentifierPaddleSportsSpeed',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  physicalEffort: {
    identifier: 'HKQuantityTypeIdentifierPhysicalEffort',
    kind: 'quantity',
    minimumIOS: '17.0',
  },
  pushCount: {
    identifier: 'HKQuantityTypeIdentifierPushCount',
    kind: 'quantity',
    minimumIOS: '10.0',
  },
  rowingSpeed: {
    identifier: 'HKQuantityTypeIdentifierRowingSpeed',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  runningPower: {
    identifier: 'HKQuantityTypeIdentifierRunningPower',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  runningSpeed: {
    identifier: 'HKQuantityTypeIdentifierRunningSpeed',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  steps: { identifier: 'HKQuantityTypeIdentifierStepCount', kind: 'quantity', minimumIOS: '8.0' },
  swimmingStrokeCount: {
    identifier: 'HKQuantityTypeIdentifierSwimmingStrokeCount',
    kind: 'quantity',
    minimumIOS: '10.0',
  },
  underwaterDepth: {
    identifier: 'HKQuantityTypeIdentifierUnderwaterDepth',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  workoutEffortScore: {
    identifier: 'HKQuantityTypeIdentifierWorkoutEffortScore',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  environmentalAudioExposure: {
    identifier: 'HKQuantityTypeIdentifierEnvironmentalAudioExposure',
    kind: 'quantity',
    minimumIOS: '13.0',
  },
  environmentalSoundReduction: {
    identifier: 'HKQuantityTypeIdentifierEnvironmentalSoundReduction',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  headphoneAudioExposure: {
    identifier: 'HKQuantityTypeIdentifierHeadphoneAudioExposure',
    kind: 'quantity',
    minimumIOS: '13.0',
  },
  atrialFibrillationBurden: {
    identifier: 'HKQuantityTypeIdentifierAtrialFibrillationBurden',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  heartRate: {
    identifier: 'HKQuantityTypeIdentifierHeartRate',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  heartRateRecoveryOneMinute: {
    identifier: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  heartRateVariabilityRMSSD: {
    identifier: 'HKQuantityTypeIdentifierHeartRateVariabilityRMSSD',
    kind: 'quantity',
    minimumIOS: '27.0',
  },
  hrv: {
    identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    kind: 'quantity',
    minimumIOS: '11.0',
  },
  peripheralPerfusionIndex: {
    identifier: 'HKQuantityTypeIdentifierPeripheralPerfusionIndex',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  restingHeartRate: {
    identifier: 'HKQuantityTypeIdentifierRestingHeartRate',
    kind: 'quantity',
    minimumIOS: '11.0',
  },
  VO2Max: { identifier: 'HKQuantityTypeIdentifierVO2Max', kind: 'quantity', minimumIOS: '11.0' },
  walkingHeartRateAverage: {
    identifier: 'HKQuantityTypeIdentifierWalkingHeartRateAverage',
    kind: 'quantity',
    minimumIOS: '11.0',
  },
  appleWalkingSteadiness: {
    identifier: 'HKQuantityTypeIdentifierAppleWalkingSteadiness',
    kind: 'quantity',
    minimumIOS: '15.0',
  },
  runningGroundContactTime: {
    identifier: 'HKQuantityTypeIdentifierRunningGroundContactTime',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  runningStrideLength: {
    identifier: 'HKQuantityTypeIdentifierRunningStrideLength',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  runningVerticalOscillation: {
    identifier: 'HKQuantityTypeIdentifierRunningVerticalOscillation',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  sixMinuteWalkTestDistance: {
    identifier: 'HKQuantityTypeIdentifierSixMinuteWalkTestDistance',
    kind: 'quantity',
    minimumIOS: '14.0',
  },
  stairAscentSpeed: {
    identifier: 'HKQuantityTypeIdentifierStairAscentSpeed',
    kind: 'quantity',
    minimumIOS: '14.0',
  },
  stairDescentSpeed: {
    identifier: 'HKQuantityTypeIdentifierStairDescentSpeed',
    kind: 'quantity',
    minimumIOS: '14.0',
  },
  walkingAsymmetryPercentage: {
    identifier: 'HKQuantityTypeIdentifierWalkingAsymmetryPercentage',
    kind: 'quantity',
    minimumIOS: '14.0',
  },
  walkingDoubleSupportPercentage: {
    identifier: 'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage',
    kind: 'quantity',
    minimumIOS: '14.0',
  },
  walkingSpeed: {
    identifier: 'HKQuantityTypeIdentifierWalkingSpeed',
    kind: 'quantity',
    minimumIOS: '14.0',
  },
  walkingStepLength: {
    identifier: 'HKQuantityTypeIdentifierWalkingStepLength',
    kind: 'quantity',
    minimumIOS: '14.0',
  },
  dietaryBiotin: {
    identifier: 'HKQuantityTypeIdentifierDietaryBiotin',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryCaffeine: {
    identifier: 'HKQuantityTypeIdentifierDietaryCaffeine',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryCalcium: {
    identifier: 'HKQuantityTypeIdentifierDietaryCalcium',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryCarbohydrates: {
    identifier: 'HKQuantityTypeIdentifierDietaryCarbohydrates',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryChloride: {
    identifier: 'HKQuantityTypeIdentifierDietaryChloride',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryCholesterol: {
    identifier: 'HKQuantityTypeIdentifierDietaryCholesterol',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryChromium: {
    identifier: 'HKQuantityTypeIdentifierDietaryChromium',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryCopper: {
    identifier: 'HKQuantityTypeIdentifierDietaryCopper',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryEnergyConsumed: {
    identifier: 'HKQuantityTypeIdentifierDietaryEnergyConsumed',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryFatMonounsaturated: {
    identifier: 'HKQuantityTypeIdentifierDietaryFatMonounsaturated',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryFatPolyunsaturated: {
    identifier: 'HKQuantityTypeIdentifierDietaryFatPolyunsaturated',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryFatSaturated: {
    identifier: 'HKQuantityTypeIdentifierDietaryFatSaturated',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryFatTotal: {
    identifier: 'HKQuantityTypeIdentifierDietaryFatTotal',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryFiber: {
    identifier: 'HKQuantityTypeIdentifierDietaryFiber',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryFolate: {
    identifier: 'HKQuantityTypeIdentifierDietaryFolate',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryIodine: {
    identifier: 'HKQuantityTypeIdentifierDietaryIodine',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryIron: {
    identifier: 'HKQuantityTypeIdentifierDietaryIron',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryMagnesium: {
    identifier: 'HKQuantityTypeIdentifierDietaryMagnesium',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryManganese: {
    identifier: 'HKQuantityTypeIdentifierDietaryManganese',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryMolybdenum: {
    identifier: 'HKQuantityTypeIdentifierDietaryMolybdenum',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryNiacin: {
    identifier: 'HKQuantityTypeIdentifierDietaryNiacin',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryPantothenicAcid: {
    identifier: 'HKQuantityTypeIdentifierDietaryPantothenicAcid',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryPhosphorus: {
    identifier: 'HKQuantityTypeIdentifierDietaryPhosphorus',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryPotassium: {
    identifier: 'HKQuantityTypeIdentifierDietaryPotassium',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryProtein: {
    identifier: 'HKQuantityTypeIdentifierDietaryProtein',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryRiboflavin: {
    identifier: 'HKQuantityTypeIdentifierDietaryRiboflavin',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietarySelenium: {
    identifier: 'HKQuantityTypeIdentifierDietarySelenium',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietarySodium: {
    identifier: 'HKQuantityTypeIdentifierDietarySodium',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietarySugar: {
    identifier: 'HKQuantityTypeIdentifierDietarySugar',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryThiamin: {
    identifier: 'HKQuantityTypeIdentifierDietaryThiamin',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryVitaminA: {
    identifier: 'HKQuantityTypeIdentifierDietaryVitaminA',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryVitaminB12: {
    identifier: 'HKQuantityTypeIdentifierDietaryVitaminB12',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryVitaminB6: {
    identifier: 'HKQuantityTypeIdentifierDietaryVitaminB6',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryVitaminC: {
    identifier: 'HKQuantityTypeIdentifierDietaryVitaminC',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryVitaminD: {
    identifier: 'HKQuantityTypeIdentifierDietaryVitaminD',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryVitaminE: {
    identifier: 'HKQuantityTypeIdentifierDietaryVitaminE',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryVitaminK: {
    identifier: 'HKQuantityTypeIdentifierDietaryVitaminK',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  dietaryWater: {
    identifier: 'HKQuantityTypeIdentifierDietaryWater',
    kind: 'quantity',
    minimumIOS: '9.0',
  },
  dietaryZinc: {
    identifier: 'HKQuantityTypeIdentifierDietaryZinc',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  bloodAlcoholContent: {
    identifier: 'HKQuantityTypeIdentifierBloodAlcoholContent',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  bloodPressureDiastolic: {
    identifier: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  bloodPressureSystolic: {
    identifier: 'HKQuantityTypeIdentifierBloodPressureSystolic',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  insulinDelivery: {
    identifier: 'HKQuantityTypeIdentifierInsulinDelivery',
    kind: 'quantity',
    minimumIOS: '11.0',
  },
  numberOfAlcoholicBeverages: {
    identifier: 'HKQuantityTypeIdentifierNumberOfAlcoholicBeverages',
    kind: 'quantity',
    minimumIOS: '15.0',
  },
  numberOfTimesFallen: {
    identifier: 'HKQuantityTypeIdentifierNumberOfTimesFallen',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  timeInDaylight: {
    identifier: 'HKQuantityTypeIdentifierTimeInDaylight',
    kind: 'quantity',
    minimumIOS: '17.0',
  },
  uvExposure: {
    identifier: 'HKQuantityTypeIdentifierUVExposure',
    kind: 'quantity',
    minimumIOS: '9.0',
  },
  waterTemperature: {
    identifier: 'HKQuantityTypeIdentifierWaterTemperature',
    kind: 'quantity',
    minimumIOS: '16.0',
  },
  basalBodyTemperature: {
    identifier: 'HKQuantityTypeIdentifierBasalBodyTemperature',
    kind: 'quantity',
    minimumIOS: '9.0',
  },
  appleSleepingBreathingDisturbances: {
    identifier: 'HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances',
    kind: 'quantity',
    minimumIOS: '18.0',
  },
  forcedExpiratoryVolume1: {
    identifier: 'HKQuantityTypeIdentifierForcedExpiratoryVolume1',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  forcedVitalCapacity: {
    identifier: 'HKQuantityTypeIdentifierForcedVitalCapacity',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  inhalerUsage: {
    identifier: 'HKQuantityTypeIdentifierInhalerUsage',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  oxygenSaturation: {
    identifier: 'HKQuantityTypeIdentifierOxygenSaturation',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  peakExpiratoryFlowRate: {
    identifier: 'HKQuantityTypeIdentifierPeakExpiratoryFlowRate',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  respiratoryRate: {
    identifier: 'HKQuantityTypeIdentifierRespiratoryRate',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  bloodGlucose: {
    identifier: 'HKQuantityTypeIdentifierBloodGlucose',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  bodyTemperature: {
    identifier: 'HKQuantityTypeIdentifierBodyTemperature',
    kind: 'quantity',
    minimumIOS: '8.0',
  },
  audioExposureEvent: {
    identifier: 'HKCategoryTypeIdentifierAudioExposureEvent',
    kind: 'category',
    minimumIOS: '13.0',
    categoryValues: 'HKCategoryValueEnvironmentalAudioExposureEvent',
    deprecated: true,
  },
  appleStandHour: {
    identifier: 'HKCategoryTypeIdentifierAppleStandHour',
    kind: 'category',
    minimumIOS: '9.0',
    categoryValues: 'HKCategoryValueAppleStandHour',
  },
  environmentalAudioExposureEvent: {
    identifier: 'HKCategoryTypeIdentifierEnvironmentalAudioExposureEvent',
    kind: 'category',
    minimumIOS: '14.0',
    categoryValues: 'HKCategoryValueEnvironmentalAudioExposureEvent',
  },
  headphoneAudioExposureEvent: {
    identifier: 'HKCategoryTypeIdentifierHeadphoneAudioExposureEvent',
    kind: 'category',
    minimumIOS: '14.2',
    categoryValues: 'HKCategoryValueHeadphoneAudioExposureEvent',
  },
  highHeartRateEvent: {
    identifier: 'HKCategoryTypeIdentifierHighHeartRateEvent',
    kind: 'category',
    minimumIOS: '12.2',
    categoryValues: 'HKCategoryValue',
  },
  hypertensionEvent: {
    identifier: 'HKCategoryTypeIdentifierHypertensionEvent',
    kind: 'category',
    minimumIOS: '26.2',
    categoryValues: 'HKCategoryValue',
  },
  irregularHeartRhythmEvent: {
    identifier: 'HKCategoryTypeIdentifierIrregularHeartRhythmEvent',
    kind: 'category',
    minimumIOS: '12.2',
    categoryValues: 'HKCategoryValue',
  },
  lowCardioFitnessEvent: {
    identifier: 'HKCategoryTypeIdentifierLowCardioFitnessEvent',
    kind: 'category',
    minimumIOS: '14.3',
    categoryValues: 'HKCategoryValueLowCardioFitnessEvent',
  },
  lowHeartRateEvent: {
    identifier: 'HKCategoryTypeIdentifierLowHeartRateEvent',
    kind: 'category',
    minimumIOS: '12.2',
    categoryValues: 'HKCategoryValue',
  },
  mindfulSession: {
    identifier: 'HKCategoryTypeIdentifierMindfulSession',
    kind: 'category',
    minimumIOS: '10.0',
    categoryValues: 'HKCategoryValue',
  },
  appleWalkingSteadinessEvent: {
    identifier: 'HKCategoryTypeIdentifierAppleWalkingSteadinessEvent',
    kind: 'category',
    minimumIOS: '15.0',
    categoryValues: 'HKCategoryValueAppleWalkingSteadinessEvent',
  },
  handwashingEvent: {
    identifier: 'HKCategoryTypeIdentifierHandwashingEvent',
    kind: 'category',
    minimumIOS: '14.0',
    categoryValues: 'HKCategoryValue',
  },
  toothbrushingEvent: {
    identifier: 'HKCategoryTypeIdentifierToothbrushingEvent',
    kind: 'category',
    minimumIOS: '13.0',
    categoryValues: 'HKCategoryValue',
  },
  bleedingAfterMenopause: {
    identifier: 'HKCategoryTypeIdentifierBleedingAfterMenopause',
    kind: 'category',
    minimumIOS: '27.0',
    categoryValues: 'HKCategoryValueVaginalBleeding',
  },
  bleedingAfterPregnancy: {
    identifier: 'HKCategoryTypeIdentifierBleedingAfterPregnancy',
    kind: 'category',
    minimumIOS: '18.0',
    categoryValues: 'HKCategoryValueVaginalBleeding',
  },
  bleedingDuringPregnancy: {
    identifier: 'HKCategoryTypeIdentifierBleedingDuringPregnancy',
    kind: 'category',
    minimumIOS: '18.0',
    categoryValues: 'HKCategoryValueVaginalBleeding',
  },
  cervicalMucusQuality: {
    identifier: 'HKCategoryTypeIdentifierCervicalMucusQuality',
    kind: 'category',
    minimumIOS: '9.0',
    categoryValues: 'HKCategoryValueCervicalMucusQuality',
  },
  contraceptive: {
    identifier: 'HKCategoryTypeIdentifierContraceptive',
    kind: 'category',
    minimumIOS: '14.3',
    categoryValues: 'HKCategoryValueContraceptive',
  },
  infrequentMenstrualCycles: {
    identifier: 'HKCategoryTypeIdentifierInfrequentMenstrualCycles',
    kind: 'category',
    minimumIOS: '16.0',
    categoryValues: 'HKCategoryValue',
  },
  intermenstrualBleeding: {
    identifier: 'HKCategoryTypeIdentifierIntermenstrualBleeding',
    kind: 'category',
    minimumIOS: '9.0',
    categoryValues: 'HKCategoryValue',
  },
  irregularMenstrualCycles: {
    identifier: 'HKCategoryTypeIdentifierIrregularMenstrualCycles',
    kind: 'category',
    minimumIOS: '16.0',
    categoryValues: 'HKCategoryValue',
  },
  lactation: {
    identifier: 'HKCategoryTypeIdentifierLactation',
    kind: 'category',
    minimumIOS: '14.3',
    categoryValues: 'HKCategoryValue',
  },
  menopausalState: {
    identifier: 'HKCategoryTypeIdentifierMenopausalState',
    kind: 'category',
    minimumIOS: '27.0',
    categoryValues: 'HKCategoryValueMenopausalState',
  },
  menstrualFlow: {
    identifier: 'HKCategoryTypeIdentifierMenstrualFlow',
    kind: 'category',
    minimumIOS: '9.0',
    categoryValues: 'HKCategoryValueVaginalBleeding',
  },
  ovulationTestResult: {
    identifier: 'HKCategoryTypeIdentifierOvulationTestResult',
    kind: 'category',
    minimumIOS: '9.0',
    categoryValues: 'HKCategoryValueOvulationTestResult',
  },
  persistentIntermenstrualBleeding: {
    identifier: 'HKCategoryTypeIdentifierPersistentIntermenstrualBleeding',
    kind: 'category',
    minimumIOS: '16.0',
    categoryValues: 'HKCategoryValue',
  },
  pregnancy: {
    identifier: 'HKCategoryTypeIdentifierPregnancy',
    kind: 'category',
    minimumIOS: '14.3',
    categoryValues: 'HKCategoryValue',
  },
  pregnancyTestResult: {
    identifier: 'HKCategoryTypeIdentifierPregnancyTestResult',
    kind: 'category',
    minimumIOS: '15.0',
    categoryValues: 'HKCategoryValuePregnancyTestResult',
  },
  progesteroneTestResult: {
    identifier: 'HKCategoryTypeIdentifierProgesteroneTestResult',
    kind: 'category',
    minimumIOS: '15.0',
    categoryValues: 'HKCategoryValueProgesteroneTestResult',
  },
  prolongedMenstrualPeriods: {
    identifier: 'HKCategoryTypeIdentifierProlongedMenstrualPeriods',
    kind: 'category',
    minimumIOS: '16.0',
    categoryValues: 'HKCategoryValue',
  },
  sexualActivity: {
    identifier: 'HKCategoryTypeIdentifierSexualActivity',
    kind: 'category',
    minimumIOS: '9.0',
    categoryValues: 'HKCategoryValue',
  },
  sleepApneaEvent: {
    identifier: 'HKCategoryTypeIdentifierSleepApneaEvent',
    kind: 'category',
    minimumIOS: '18.0',
    categoryValues: 'HKCategoryValue',
  },
  sleep: {
    identifier: 'HKCategoryTypeIdentifierSleepAnalysis',
    kind: 'category',
    minimumIOS: '8.0',
    categoryValues: 'HKCategoryValueSleepAnalysis',
  },
  abdominalCramps: {
    identifier: 'HKCategoryTypeIdentifierAbdominalCramps',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  acne: {
    identifier: 'HKCategoryTypeIdentifierAcne',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  appetiteChanges: {
    identifier: 'HKCategoryTypeIdentifierAppetiteChanges',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueAppetiteChanges',
  },
  bladderIncontinence: {
    identifier: 'HKCategoryTypeIdentifierBladderIncontinence',
    kind: 'category',
    minimumIOS: '14.0',
    categoryValues: 'HKCategoryValueSeverity',
  },
  bloating: {
    identifier: 'HKCategoryTypeIdentifierBloating',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  breastPain: {
    identifier: 'HKCategoryTypeIdentifierBreastPain',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  chestTightnessOrPain: {
    identifier: 'HKCategoryTypeIdentifierChestTightnessOrPain',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  chills: {
    identifier: 'HKCategoryTypeIdentifierChills',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  constipation: {
    identifier: 'HKCategoryTypeIdentifierConstipation',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  coughing: {
    identifier: 'HKCategoryTypeIdentifierCoughing',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  diarrhea: {
    identifier: 'HKCategoryTypeIdentifierDiarrhea',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  dizziness: {
    identifier: 'HKCategoryTypeIdentifierDizziness',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  drySkin: {
    identifier: 'HKCategoryTypeIdentifierDrySkin',
    kind: 'category',
    minimumIOS: '14.0',
    categoryValues: 'HKCategoryValueSeverity',
  },
  fainting: {
    identifier: 'HKCategoryTypeIdentifierFainting',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  fatigue: {
    identifier: 'HKCategoryTypeIdentifierFatigue',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  fever: {
    identifier: 'HKCategoryTypeIdentifierFever',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  generalizedBodyAche: {
    identifier: 'HKCategoryTypeIdentifierGeneralizedBodyAche',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  hairLoss: {
    identifier: 'HKCategoryTypeIdentifierHairLoss',
    kind: 'category',
    minimumIOS: '14.0',
    categoryValues: 'HKCategoryValueSeverity',
  },
  headache: {
    identifier: 'HKCategoryTypeIdentifierHeadache',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  heartburn: {
    identifier: 'HKCategoryTypeIdentifierHeartburn',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  hotFlashes: {
    identifier: 'HKCategoryTypeIdentifierHotFlashes',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  lossOfSmell: {
    identifier: 'HKCategoryTypeIdentifierLossOfSmell',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  lossOfTaste: {
    identifier: 'HKCategoryTypeIdentifierLossOfTaste',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  lowerBackPain: {
    identifier: 'HKCategoryTypeIdentifierLowerBackPain',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  memoryLapse: {
    identifier: 'HKCategoryTypeIdentifierMemoryLapse',
    kind: 'category',
    minimumIOS: '14.0',
    categoryValues: 'HKCategoryValueSeverity',
  },
  moodChanges: {
    identifier: 'HKCategoryTypeIdentifierMoodChanges',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValuePresence',
  },
  nausea: {
    identifier: 'HKCategoryTypeIdentifierNausea',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  nightSweats: {
    identifier: 'HKCategoryTypeIdentifierNightSweats',
    kind: 'category',
    minimumIOS: '14.0',
    categoryValues: 'HKCategoryValueSeverity',
  },
  pelvicPain: {
    identifier: 'HKCategoryTypeIdentifierPelvicPain',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  rapidPoundingOrFlutteringHeartbeat: {
    identifier: 'HKCategoryTypeIdentifierRapidPoundingOrFlutteringHeartbeat',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  runnyNose: {
    identifier: 'HKCategoryTypeIdentifierRunnyNose',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  shortnessOfBreath: {
    identifier: 'HKCategoryTypeIdentifierShortnessOfBreath',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  sinusCongestion: {
    identifier: 'HKCategoryTypeIdentifierSinusCongestion',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  skippedHeartbeat: {
    identifier: 'HKCategoryTypeIdentifierSkippedHeartbeat',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  sleepChanges: {
    identifier: 'HKCategoryTypeIdentifierSleepChanges',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValuePresence',
  },
  soreThroat: {
    identifier: 'HKCategoryTypeIdentifierSoreThroat',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  vaginalDryness: {
    identifier: 'HKCategoryTypeIdentifierVaginalDryness',
    kind: 'category',
    minimumIOS: '14.0',
    categoryValues: 'HKCategoryValueSeverity',
  },
  vomiting: {
    identifier: 'HKCategoryTypeIdentifierVomiting',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  wheezing: {
    identifier: 'HKCategoryTypeIdentifierWheezing',
    kind: 'category',
    minimumIOS: '13.6',
    categoryValues: 'HKCategoryValueSeverity',
  },
  activityMoveMode: {
    identifier: 'HKCharacteristicTypeIdentifierActivityMoveMode',
    kind: 'characteristic',
    minimumIOS: '14.0',
  },
  biologicalSex: {
    identifier: 'HKCharacteristicTypeIdentifierBiologicalSex',
    kind: 'characteristic',
    minimumIOS: '8.0',
  },
  bloodType: {
    identifier: 'HKCharacteristicTypeIdentifierBloodType',
    kind: 'characteristic',
    minimumIOS: '8.0',
  },
  dateOfBirth: {
    identifier: 'HKCharacteristicTypeIdentifierDateOfBirth',
    kind: 'characteristic',
    minimumIOS: '8.0',
  },
  fitzpatrickSkinType: {
    identifier: 'HKCharacteristicTypeIdentifierFitzpatrickSkinType',
    kind: 'characteristic',
    minimumIOS: '9.0',
  },
  wheelchairUse: {
    identifier: 'HKCharacteristicTypeIdentifierWheelchairUse',
    kind: 'characteristic',
    minimumIOS: '10.0',
  },
  bloodPressure: {
    identifier: 'HKCorrelationTypeIdentifierBloodPressure',
    kind: 'correlation',
    minimumIOS: '8.0',
  },
  food: { identifier: 'HKCorrelationTypeIdentifierFood', kind: 'correlation', minimumIOS: '8.0' },
  cdaDocument: { identifier: 'HKDocumentTypeIdentifierCDA', kind: 'document', minimumIOS: '10.0' },
  gad7: {
    identifier: 'HKScoredAssessmentTypeIdentifierGAD7',
    kind: 'assessment',
    minimumIOS: '18.0',
  },
  phq9: {
    identifier: 'HKScoredAssessmentTypeIdentifierPHQ9',
    kind: 'assessment',
    minimumIOS: '18.0',
  },
  clinicalAllergyRecord: {
    identifier: 'HKClinicalTypeIdentifierAllergyRecord',
    kind: 'clinical',
    minimumIOS: '12.0',
  },
  clinicalClinicalNoteRecord: {
    identifier: 'HKClinicalTypeIdentifierClinicalNoteRecord',
    kind: 'clinical',
    minimumIOS: '16.4',
  },
  clinicalConditionRecord: {
    identifier: 'HKClinicalTypeIdentifierConditionRecord',
    kind: 'clinical',
    minimumIOS: '12.0',
  },
  clinicalImmunizationRecord: {
    identifier: 'HKClinicalTypeIdentifierImmunizationRecord',
    kind: 'clinical',
    minimumIOS: '12.0',
  },
  clinicalLabResultRecord: {
    identifier: 'HKClinicalTypeIdentifierLabResultRecord',
    kind: 'clinical',
    minimumIOS: '12.0',
  },
  clinicalMedicationRecord: {
    identifier: 'HKClinicalTypeIdentifierMedicationRecord',
    kind: 'clinical',
    minimumIOS: '12.0',
  },
  clinicalProcedureRecord: {
    identifier: 'HKClinicalTypeIdentifierProcedureRecord',
    kind: 'clinical',
    minimumIOS: '12.0',
  },
  clinicalVitalSignRecord: {
    identifier: 'HKClinicalTypeIdentifierVitalSignRecord',
    kind: 'clinical',
    minimumIOS: '12.0',
  },
  clinicalCoverageRecord: {
    identifier: 'HKClinicalTypeIdentifierCoverageRecord',
    kind: 'clinical',
    minimumIOS: '14.0',
  },
  workouts: { identifier: 'HKWorkoutTypeIdentifier', kind: 'workout', minimumIOS: '8.0' },
  workoutRoute: { identifier: 'HKWorkoutRouteTypeIdentifier', kind: 'route', minimumIOS: '11.0' },
  heartbeatSeries: {
    identifier: 'HKDataTypeIdentifierHeartbeatSeries',
    kind: 'heartbeat',
    minimumIOS: '13.0',
  },
  electrocardiogram: {
    identifier: null,
    kind: 'electrocardiogram',
    minimumIOS: '14.0',
  },
  audiogram: { identifier: null, kind: 'audiogram', minimumIOS: '13.0' },
  visionPrescription: {
    identifier: 'HKVisionPrescriptionTypeIdentifier',
    kind: 'vision',
    minimumIOS: '16.0',
  },
  stateOfMind: {
    identifier: 'HKDataTypeIdentifierStateOfMind',
    kind: 'stateOfMind',
    minimumIOS: '18.0',
  },
  activitySummary: {
    identifier: null,
    kind: 'activitySummary',
    minimumIOS: '9.3',
  },
  medicationDoseEvent: {
    identifier: 'HKMedicationDoseEventTypeIdentifierMedicationDoseEvent',
    kind: 'medicationDoseEvent',
    minimumIOS: '26.0',
  },
  userAnnotatedMedication: {
    identifier: 'HKDataTypeIdentifierUserAnnotatedMedicationConcept',
    kind: 'medication',
    minimumIOS: '26.0',
  },
} as const;

export type HealthDataType = keyof typeof HEALTH_TYPE_CATALOG;
export type HealthTypeKind = (typeof HEALTH_TYPE_CATALOG)[HealthDataType]['kind'];
export const HEALTH_DATA_TYPES = Object.keys(HEALTH_TYPE_CATALOG) as HealthDataType[];

/** The object type whose selection controls access to these records. */
export function healthRecordSelectionType(type: HealthDataType): HealthDataType | undefined {
  if (type === 'visionPrescription') return type;
  if (type === 'userAnnotatedMedication' || type === 'medicationDoseEvent')
    return 'userAnnotatedMedication';
  return undefined;
}

/** Resolve the types that own read authorization, including correlations and medication doses. */
export function healthAuthorizationTypes(type: HealthDataType): HealthDataType[] {
  const selectionType = healthRecordSelectionType(type);
  if (selectionType) return [selectionType];
  if (type === 'audioExposureEvent') return ['environmentalAudioExposureEvent'];
  if (type === 'bloodPressure') return ['bloodPressureSystolic', 'bloodPressureDiastolic'];
  if (type === 'food') return HEALTH_DATA_TYPES.filter((name) => name.startsWith('dietary'));
  return [type];
}

export const HEALTH_SUMMARY_METRICS = [
  'steps',
  'activeEnergy',
  'distance',
  'heartRate',
  'restingHeartRate',
  'hrv',
  'sleep',
] as const;
