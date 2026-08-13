import { createIcon } from '../createIcon';

/**
 * SpeechIcon — SF `speaker.wave.2.bubble.left` / Material `text_to_speech` (was lucide `speech`).
 * DRIFT: TTS-model tag: platform glyphs say "spoken audio" rather than lucide's talking head.
 */
export default createIcon({
  displayName: 'SpeechIcon',
  sf: 'speaker.wave.2.bubble.left',
  glyph: '\uf1bc',
});
