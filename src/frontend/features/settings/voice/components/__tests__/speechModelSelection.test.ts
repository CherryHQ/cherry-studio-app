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
  expect(voiceAfterModelChange('Zephyr', { voices: [], acceptsCustomVoice: true })).toBe('');
});
