import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('Android SpeechPlaybackService uses Record bridge, public silent NotificationChannel, custom stop action, focus gate, and explicit end promise', () => {
  const service = readFileSync(
    join(
      root,
      'modules/voice-input/android/src/main/java/expo/modules/voiceinput/SpeechPlaybackService.kt',
    ),
    'utf8',
  );
  const voiceModule = readFileSync(
    join(
      root,
      'modules/voice-input/android/src/main/java/expo/modules/voiceinput/VoiceInputModule.kt',
    ),
    'utf8',
  );

  // Uses Expo Record instead of >8-parameter closure and single unified playbackCommand event.
  expect(voiceModule).toContain('class PlaybackRequest : Record');
  expect(voiceModule).toContain(
    'AsyncFunction("beginPlayback") { request: PlaybackRequest, promise: Promise ->',
  );
  expect(voiceModule).toContain('AsyncFunction("requestPlaybackFocus")');
  expect(voiceModule).toContain('AsyncFunction("endPlayback") { id: String, promise: Promise ->');
  expect(voiceModule).toContain('Events("finished", "level", "playbackCommand")');
  expect(voiceModule).toContain('updatePlaybackState');

  // Public NotificationChannel silence instead of @hide Notification.Builder.setSilent.
  expect(service).not.toContain('.setSilent(');
  expect(service).toContain('setSound(null, null)');
  expect(service).toContain('enableVibration(false)');

  // Brand icon + custom vector play/pause/stop + Android 13+ PlaybackState CustomAction stop + deep link.
  expect(service).toContain('BRAND_COLOR = 0xFFC74444.toInt()');
  expect(service).toContain('getIdentifier("notification_icon", "drawable", packageName)');
  expect(service).toContain('R.drawable.ic_voice_play');
  expect(service).toContain('R.drawable.ic_voice_pause');
  expect(service).toContain('R.drawable.ic_voice_stop');
  expect(service).not.toContain('android.R.drawable.ic_media_');
  expect(service).toContain('PlaybackState.CustomAction.Builder(');
  expect(service).toContain('override fun onCustomAction(');
  expect(service).toContain('fun requestFocus(id: String): Boolean');
  expect(service).toContain('val endPromises: MutableList<Promise>');
  expect(service).toContain('INTERRUPT = "interrupt"');
  expect(service).toContain('RESUME_INTERRUPTION = "resume-interruption"');
  expect(service).not.toContain('userPaused');
  expect(service).not.toContain('pausedByTransientFocusLoss');
  expect(service).toContain('Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP');

  for (const icon of ['ic_voice_play.xml', 'ic_voice_pause.xml', 'ic_voice_stop.xml']) {
    const xml = readFileSync(
      join(root, 'modules/voice-input/android/src/main/res/drawable', icon),
      'utf8',
    );
    expect(xml).toContain('<vector');
  }
});

test('iOS VoiceInput uses Record bridge, main-queue remote commands, semantic interruption signals, and active-owner Now Playing guard', () => {
  const podspec = readFileSync(join(root, 'modules/voice-input/ios/VoiceInput.podspec'), 'utf8');
  const controls = readFileSync(
    join(root, 'modules/voice-input/ios/SpeechPlaybackControls.swift'),
    'utf8',
  );
  const voiceModule = readFileSync(
    join(root, 'modules/voice-input/ios/VoiceInputModule.swift'),
    'utf8',
  );

  expect(podspec).toContain("'MediaPlayer'");
  expect(voiceModule).toContain('struct PlaybackRequest: Record');
  expect(voiceModule).toContain('AsyncFunction("beginPlayback") { (request: PlaybackRequest) in');
  expect(voiceModule).toContain('Events("finished", "level", "playbackCommand")');
  expect(voiceModule).toContain('self.playback.endAll()');

  expect(controls).toContain('private static weak var activeOwner: SpeechPlaybackControls?');
  expect(controls).toContain('private var isActiveOwner: Bool');
  expect(controls).toContain('DispatchQueue.main.async');
  expect(controls).toContain('MPNowPlayingInfoCenter');
  expect(controls).toContain('MPRemoteCommandCenter');
  expect(controls).toContain('"interrupt"');
  expect(controls).toContain('"resume-interruption"');
  expect(controls).toContain('.shouldResume');
  expect(controls).not.toContain('interruptedBySystem');
  expect(controls).toContain('Self.activeOwner == nil || Self.activeOwner === self');
});
