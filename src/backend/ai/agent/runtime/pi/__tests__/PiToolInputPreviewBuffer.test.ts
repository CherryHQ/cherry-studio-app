import { PiToolInputPreviewBuffer } from '../PiToolInputPreviewBuffer';

describe('PiToolInputPreviewBuffer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('coalesces a burst into the latest bounded preview and omits other arguments', () => {
    const publish = jest.fn();
    const buffer = new PiToolInputPreviewBuffer(publish);
    for (let index = 0; index < 100; index += 1) {
      buffer.update(
        'write',
        { textField: 'content', nameField: 'filename' },
        {
          content: 'x'.repeat(100_000) + `latest ${index}`,
          filename: 'page.html',
          unrelated: 'must not enter the preview',
        },
      );
    }
    expect(publish).not.toHaveBeenCalled();
    jest.advanceTimersByTime(150);
    expect(publish).toHaveBeenCalledTimes(1);
    const [id, preview] = publish.mock.calls[0];
    expect(id).toBe('write');
    expect(preview).toEqual({ name: 'page.html', text: expect.any(String), truncated: true });
    expect(preview.text.length).toBeLessThanOrEqual(8_192);
    expect(preview.text.endsWith('latest 99')).toBe(true);
    buffer.dispose();
  });

  test('flushes the last pending input on completion without mixing interleaved calls', () => {
    const publish = jest.fn();
    const buffer = new PiToolInputPreviewBuffer(publish);
    buffer.update('write', { textField: 'content' }, { content: 'new file' });
    buffer.update(
      'edit',
      { textField: 'new_string' },
      { old_string: 'old', new_string: 'replacement' },
    );
    buffer.flush('edit');
    expect(publish.mock.calls).toEqual([['edit', { text: 'replacement', truncated: false }]]);
    jest.advanceTimersByTime(150);
    expect(publish.mock.calls[1]).toEqual(['write', { text: 'new file', truncated: false }]);
    buffer.dispose();
  });

  test('drops pending work on cancellation and ignores fields that are not text', () => {
    const publish = jest.fn();
    const buffer = new PiToolInputPreviewBuffer(publish);
    buffer.update('write', { textField: 'content' }, { content: { nested: 'value' } });
    jest.advanceTimersByTime(150);
    expect(publish).not.toHaveBeenCalled();
    buffer.update('write', { textField: 'content' }, { content: 'unfinished' });
    buffer.dispose();
    jest.runOnlyPendingTimers();
    expect(publish).not.toHaveBeenCalled();
  });
});
