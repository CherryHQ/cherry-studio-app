import { transcriptionMediaType } from '../audioFileTypes';

test('uploads use the type whose name the transcription protocol recognizes', () => {
  // The extension decides first, since pickers label audio generically or as video.
  expect(
    transcriptionMediaType({ name: 'meeting.m4a', mediaType: 'application/octet-stream' }),
  ).toBe('audio/mp4');
  expect(transcriptionMediaType({ name: 'call.mp4', mediaType: 'video/mp4' })).toBe('audio/mp4');
  // Without a known extension, aliases map to the canonical type.
  expect(transcriptionMediaType({ name: 'recording', mediaType: 'audio/x-m4a' })).toBe('audio/mp4');
  expect(transcriptionMediaType({ name: 'take', mediaType: 'audio/wave; codecs=1' })).toBe(
    'audio/wav',
  );
  expect(transcriptionMediaType({ name: 'memo.amr', mediaType: 'audio/amr' })).toBeUndefined();
  expect(
    transcriptionMediaType({ name: 'notes.constructor', mediaType: 'text/plain' }),
  ).toBeUndefined();
});
