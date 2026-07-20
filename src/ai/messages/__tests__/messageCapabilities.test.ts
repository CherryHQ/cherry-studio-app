import { MODALITY } from '@cherrystudio/provider-registry';
import type { UIMessage } from 'ai';

import type { Model } from '@/data/types/model';

import { resolveMediaCapabilities, stripUnsupportedMedia } from '../messageCapabilities';
import type { MediaCapabilities } from '../messageCapabilities';

const model = (inputModalities: string[]): Model =>
  ({ capabilities: [], inputModalities }) as unknown as Model;

const fileMsg = (mediaType: string): UIMessage =>
  ({
    id: 'm',
    role: 'user',
    parts: [{ type: 'file', mediaType, url: 'data:application/octet-stream;base64,AA' }],
  }) as UIMessage;

describe('resolveMediaCapabilities', () => {
  it('derives modality flags from the model (pdf defaults to false without provider)', () => {
    expect(resolveMediaCapabilities(model([MODALITY.IMAGE]))).toEqual({
      image: true,
      video: false,
      audio: false,
      pdf: false,
    });
    expect(resolveMediaCapabilities(model([]))).toEqual({
      image: false,
      video: false,
      audio: false,
      pdf: false,
    });
  });
  it('resolves pdf: true for a first-party provider with a compatible model', () => {
    jest.isolateModules(() => {
      jest.mock('../../utils/model', () => ({
        ...jest.requireActual('../../utils/model'),
        isOpenAILLMModel: jest.fn().mockReturnValue(true),
      }));

      const { resolveMediaCapabilities: rmc } = require('../messageCapabilities');
      const mockModel = model([MODALITY.IMAGE]);
      const mockProvider = { id: 'my-openai', presetProviderId: undefined } as any;

      expect(rmc(mockModel, mockProvider, 'openai')).toMatchObject({ pdf: true });
    });
  });
});

describe('stripUnsupportedMedia', () => {
  const noVision: MediaCapabilities = { image: false, video: true, audio: true, pdf: true };

  it('replaces an image file part with a note when the model has no vision', () => {
    const [out] = stripUnsupportedMedia([fileMsg('image/png')], noVision);
    expect(out.parts).toEqual([
      { type: 'text', text: expect.stringContaining('image attachment omitted') },
    ]);
  });

  it('replaces a video file part when the model has no video', () => {
    const [out] = stripUnsupportedMedia([fileMsg('video/mp4')], {
      image: true,
      video: false,
      audio: true,
      pdf: true,
    });
    expect(out.parts).toEqual([
      { type: 'text', text: expect.stringContaining('video attachment omitted') },
    ]);
  });

  it('replaces an audio file part when the model has no audio', () => {
    const [out] = stripUnsupportedMedia([fileMsg('audio/mpeg')], {
      image: true,
      video: true,
      audio: false,
      pdf: true,
    });
    expect(out.parts).toEqual([
      { type: 'text', text: expect.stringContaining('audio attachment omitted') },
    ]);
  });

  it('leaves the part untouched when the modality is supported (same reference)', () => {
    const msg = fileMsg('image/png');
    expect(
      stripUnsupportedMedia([msg], { image: true, video: true, audio: true, pdf: true })[0],
    ).toBe(msg);
  });

  it('leaves non-gated files (e.g. PDF) untouched', () => {
    const msg = fileMsg('application/pdf');
    expect(stripUnsupportedMedia([msg], noVision)[0]).toBe(msg);
  });

  it('replaces only the unsupported part, keeping the rest', () => {
    const msg = {
      id: 'm',
      role: 'user',
      parts: [
        { type: 'text', text: 'hi' },
        { type: 'file', mediaType: 'image/png', url: 'data:application/octet-stream;base64,AA' },
      ],
    } as UIMessage;
    const [out] = stripUnsupportedMedia([msg], noVision);
    expect(out.parts).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'text', text: expect.stringContaining('image attachment omitted') },
    ]);
  });
});
