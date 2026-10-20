import { requireOptionalNativeModule } from 'expo';

import { getHealthAccess } from '../index';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

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
