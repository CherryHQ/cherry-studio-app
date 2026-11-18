import { speechVoiceOptions } from '../speechVoiceOptions';

test('distinguishes same-name native voices without changing their selection IDs', () => {
  expect(
    speechVoiceOptions([
      { id: 'voice-a', name: 'Mandarin', language: 'zh-CN' },
      { id: 'voice-b', name: 'Mandarin', language: 'zh-TW' },
      { id: 'alloy', name: 'alloy' },
    ]),
  ).toEqual([
    { value: 'voice-a', label: 'Mandarin', description: 'zh-CN · voice-a' },
    { value: 'voice-b', label: 'Mandarin', description: 'zh-TW · voice-b' },
    { value: 'alloy', label: 'alloy', description: undefined },
  ]);
});
