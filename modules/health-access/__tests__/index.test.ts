import { requireOptionalNativeModule } from 'expo';

import { getHealthAccess } from '../index';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

describe.each(['bloodPressure', 'bloodPressureSystolic', 'bloodPressureDiastolic'] as const)(
  '%s authorization',
  (name) => {
    test.each(['getStatuses', 'request'] as const)(
      '%s includes both blood pressure quantities for a single selected type',
      async (method) => {
        const native = {
          getStatuses: jest.fn().mockResolvedValue({}),
          request: jest.fn().mockResolvedValue({}),
        };
        jest.mocked(requireOptionalNativeModule).mockReturnValue(native as never);

        await getHealthAccess()![method]([name, 'steps']);

        expect(native[method]).toHaveBeenCalledWith([
          expect.objectContaining({
            name,
            authorization: [
              expect.objectContaining({
                identifier: 'HKQuantityTypeIdentifierBloodPressureSystolic',
              }),
              expect.objectContaining({
                identifier: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
              }),
            ],
          }),
          expect.objectContaining({
            name: 'steps',
            authorization: [
              expect.objectContaining({ identifier: 'HKQuantityTypeIdentifierStepCount' }),
            ],
          }),
        ]);
      },
    );
  },
);

test.each(['getStatuses', 'request'] as const)(
  '%s resolves medication dose authorization to the medication selection type at the native boundary',
  async (method) => {
    const native = {
      getStatuses: jest.fn().mockResolvedValue({}),
      request: jest.fn().mockResolvedValue({}),
    };
    jest.mocked(requireOptionalNativeModule).mockReturnValue(native as never);

    await getHealthAccess()![method](['medicationDoseEvent']);

    expect(native[method]).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'medicationDoseEvent',
        kind: 'medicationDoseEvent',
        authorization: [
          expect.objectContaining({
            name: 'userAnnotatedMedication',
            identifier: 'HKDataTypeIdentifierUserAnnotatedMedicationConcept',
            kind: 'medication',
            minimumIOS: '26.0',
          }),
        ],
      }),
    ]);
  },
);

test.each([
  ['workoutRoute', 'HKWorkoutTypeIdentifier', 'HKWorkoutRouteTypeIdentifier'],
  [
    'heartbeatSeries',
    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    'HKDataTypeIdentifierHeartbeatSeries',
  ],
] as const)('checks %s together with its parent type', async (name, parent, child) => {
  const native = { getStatuses: jest.fn().mockResolvedValue({}) };
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native as never);

  await getHealthAccess()!.getStatuses([name]);

  expect(native.getStatuses).toHaveBeenCalledWith([
    expect.objectContaining({
      name,
      authorization: [
        expect.objectContaining({ identifier: parent }),
        expect.objectContaining({ identifier: child }),
      ],
    }),
  ]);
});
