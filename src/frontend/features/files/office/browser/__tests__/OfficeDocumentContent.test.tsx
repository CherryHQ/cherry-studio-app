/** @jest-environment jsdom */
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';

import type { OfficeDocumentProps } from '../../officePreview';
import { OfficeDocumentContent, type OfficeRendererProps } from '../OfficeDocumentContent';

jest.mock('../officePreview.css', () => ({}));

it('keeps a mounted renderer alive across recreated native action proxies and uses the latest callbacks', async () => {
  const cancelled = jest.fn();
  const started = jest.fn();
  let select!: () => Promise<unknown>;
  function RendererProbe({ onSelection }: OfficeRendererProps) {
    useEffect(() => {
      started();
      select = () => onSelection(0, null);
      return cancelled;
    }, [onSelection]);
    return null;
  }
  const props: OfficeDocumentProps = {
    fileName: 'book.xlsx',
    colors: { paper: '#fff', ink: '#000', background: '#fff', foreground: '#000', border: '#ddd' },
    labels: {
      chart: 'Chart',
      unsupportedChart: 'Unsupported chart',
      imageUnavailable: 'Image unavailable',
    },
    command: null,
    spreadsheetView: { zoom: 100, sheet: 0 },
    getSize: jest.fn().mockResolvedValue(1),
    readChunk: jest.fn().mockResolvedValue('AA=='),
    onSelection: jest.fn().mockResolvedValue('old'),
    onStatus: jest.fn().mockResolvedValue(undefined),
    onOpenLink: jest.fn().mockResolvedValue(undefined),
  };
  const view = render(<OfficeDocumentContent {...props} type="xlsx" Renderer={RendererProbe} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(started).toHaveBeenCalledTimes(1);
  const next = {
    ...props,
    onSelection: jest.fn().mockResolvedValue('new'),
    onStatus: jest.fn().mockResolvedValue(undefined),
    spreadsheetView: { zoom: 125, sheet: 0 },
  };
  view.rerender(<OfficeDocumentContent {...next} type="xlsx" Renderer={RendererProbe} />);
  expect(started).toHaveBeenCalledTimes(1);
  expect(cancelled).not.toHaveBeenCalled();
  expect(await select()).toBe('new');
  expect(props.onSelection).not.toHaveBeenCalled();
  expect(props.getSize).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(cancelled).toHaveBeenCalledTimes(1);
});
