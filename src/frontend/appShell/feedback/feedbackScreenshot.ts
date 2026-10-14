import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { captureScreen, releaseCapture } from 'react-native-view-shot';

import {
  DIAGNOSTIC_SCREENSHOT_DIRECTORY,
  DIAGNOSTIC_SCREENSHOT_MAX_BYTES,
} from '@/shared/contracts/diagnostics';
import { loggerService } from '@/shared/core/logger/LoggerService';

export type FeedbackScreenshot = { id: string; uri: string };

export async function captureFeedbackScreenshot(): Promise<FeedbackScreenshot> {
  const uri = await captureScreen({ format: 'png', result: 'tmpfile' });
  const id = randomUUID();
  const directory = new Directory(Paths.cache, DIAGNOSTIC_SCREENSHOT_DIRECTORY);
  const file = new File(directory, `${id}.png`);
  try {
    const source = new File(uri);
    if (source.size <= 0 || source.size > DIAGNOSTIC_SCREENSHOT_MAX_BYTES)
      throw new Error('Feedback screenshot exceeds attachment limit');
    directory.create({ intermediates: true, idempotent: true });
    source.copy(file);
    return { id, uri: file.uri };
  } catch (error) {
    removeFeedbackScreenshot({ id, uri: file.uri });
    throw error;
  } finally {
    releaseCapture(uri);
  }
}

export function removeFeedbackScreenshot(screenshot: FeedbackScreenshot) {
  try {
    const file = new File(screenshot.uri);
    if (file.exists) file.delete();
  } catch {
    loggerService.withContext('FeedbackScreenshot').warn('Failed to remove feedback screenshot');
  }
}
