import { voiceAfterModelChange } from '../speechModelSelection';

test('switching voice families resets to automatic while preserving supported explicit choices', () => {
  const gemini = {
    voices: [
      { id: 'Kore', name: 'Kore' },
      { id: 'Zephyr', name: 'Zephyr' },
    ],
    defaultVoice: 'Kore',
    acceptsCustomVoice: false,
  };
  expect(voiceAfterModelChange('alloy', gemini)).toBe('');
  expect(voiceAfterModelChange('Zephyr', gemini)).toBe('Zephyr');
  expect(voiceAfterModelChange('', gemini)).toBe('');
  // A model that takes custom voice IDs keeps the explicit one; it has no automatic voice.
  expect(voiceAfterModelChange('Speaker-42', { voices: [], acceptsCustomVoice: true })).toBe(
    'Speaker-42',
  );
});
