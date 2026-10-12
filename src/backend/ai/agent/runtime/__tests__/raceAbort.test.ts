import { raceAbort } from '../raceAbort';

describe('raceAbort', () => {
  test('releases the consumer with the AbortSignal reason', async () => {
    let rejectLate!: (reason: Error) => void;
    const operation = new Promise<void>((_resolve, reject) => {
      rejectLate = reject;
    });
    const controller = new AbortController();
    const raced = raceAbort(operation, controller.signal);

    controller.abort(new Error('turn cancelled'));

    await expect(raced).rejects.toThrow('turn cancelled');
    rejectLate(new Error('late provider failure'));
    await Promise.resolve();
  });
});
