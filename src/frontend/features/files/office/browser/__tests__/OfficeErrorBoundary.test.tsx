import { useEffect } from 'react';
import { act, create } from 'react-test-renderer';

import { OfficeErrorBoundary } from '../OfficeErrorBoundary';

function DocumentProbe({ failure }: { failure?: 'render' | 'effect' }) {
  useEffect(() => {
    if (failure === 'effect') throw new Error('Chart setup failed');
  }, [failure]);
  if (failure === 'render') throw new Error('Grid render failed');
  return null;
}

it.each(['render', 'effect'] as const)(
  'reports a %s failure after a previously healthy mount',
  (failure) => {
    const onStatus = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer: ReturnType<typeof create> | undefined;
    try {
      act(() => {
        renderer = create(
          <OfficeErrorBoundary onStatus={onStatus}>
            <DocumentProbe />
          </OfficeErrorBoundary>,
        );
      });
      act(() => {
        renderer?.update(
          <OfficeErrorBoundary onStatus={onStatus}>
            <DocumentProbe failure={failure} />
          </OfficeErrorBoundary>,
        );
      });
      expect(onStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'error',
          busy: false,
          error: 'failed',
          diagnostic: expect.objectContaining({
            stage: 'react-render',
            message: failure === 'effect' ? 'Chart setup failed' : 'Grid render failed',
          }),
        }),
      );
      expect(renderer?.toJSON()).toBeNull();
    } finally {
      act(() => renderer?.unmount());
      consoleError.mockRestore();
    }
  },
);
