import { createIcon } from '../createIcon';

/**
 * ActivityIcon — SF `waveform.path.ecg` / Material `monitoring` (was lucide `activity`).
 * DRIFT: Health-check pulse: iOS keeps an ECG line, Android becomes a monitoring line chart.
 */
export default createIcon({
  displayName: 'ActivityIcon',
  sf: 'waveform.path.ecg',
  glyph: '\uf190',
});
