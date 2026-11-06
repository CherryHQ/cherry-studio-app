import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = 'node_modules/react-native-enriched-markdown';
const read = (file: string) => readFileSync(`${root}/${file}`, 'utf8');

// Delivery guards only. Native tap/selection/scroll arbitration requires device acceptance.
test('delivers link presses through both editor entry points and matching native emitters', () => {
  expect(read('src/EnrichedMarkdownTextInput.tsx')).toContain('onLinkPress={handleLinkPress');
  expect(read('lib/module/EnrichedMarkdownTextInput.js')).toContain('onLinkPress: handleLinkPress');
  for (const file of [
    'src/EnrichedMarkdownTextInputNativeComponent.ts',
    'lib/module/EnrichedMarkdownTextInputNativeComponent.ts',
    'lib/typescript/src/EnrichedMarkdownTextInputNativeComponent.d.ts',
  ]) {
    expect(read(file)).toContain('onLinkPress?: CodegenTypes.DirectEventHandler<OnInputLinkPress>');
  }
  for (const prefix of [
    'ios/generated/ReactCodegen/EnrichedMarkdownTextSpec',
    'android/generated/jni/react/renderer/components/EnrichedMarkdownTextSpec',
  ]) {
    expect(read(`${prefix}/EventEmitters.h`)).toContain(
      'void onLinkPress(OnLinkPress value) const;',
    );
    expect(read(`${prefix}/EventEmitters.cpp`)).toContain(
      'EnrichedMarkdownTextInputEventEmitter::onLinkPress',
    );
  }
  const ios = read('ios/input/EnrichedMarkdownTextInput.mm');
  expect(ios).toContain('requireGestureRecognizerToFail:_textView.panGestureRecognizer');
  expect(ios).toContain('CGRectContainsPoint(glyphRect, point)');
  const android = read(
    'android/src/main/java/com/swmansion/enriched/markdown/input/EnrichedMarkdownTextInputView.kt',
  );
  expect(android).toContain('GestureDetector.SimpleOnGestureListener');
  expect(android).toContain('override fun onSingleTapUp');
  expect(
    read(
      'android/src/main/java/com/swmansion/enriched/markdown/input/EnrichedMarkdownTextInputManager.kt',
    ),
  ).toContain('OnLinkPressEvent.EVENT_NAME');
});

test('the lockfile registers the exact native patch', () => {
  const patch = readFileSync('patches/react-native-enriched-markdown@1.1.1.patch');
  const digest = createHash('sha256').update(patch).digest('hex');
  expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
    `react-native-enriched-markdown@1.1.1: ${digest}`,
  );
});
