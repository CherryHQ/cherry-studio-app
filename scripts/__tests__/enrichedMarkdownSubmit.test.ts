import { readFileSync } from 'node:fs';

const patch = readFileSync('patches/react-native-enriched-markdown@1.1.1.patch', 'utf8');
const additions = (path: string) =>
  patch
    .split(`+++ b/${path}\n`)[1]
    ?.split('diff --git ')[0]
    .split('\n')
    .filter((line) => line.startsWith('+'))
    .map((line) => line.slice(1))
    .join('\n');

// Upgrade guards for the maintained native boundary. These do not establish IME/device behavior.
describe('native soft-keyboard submission', () => {
  test('keeps the source and shipped JavaScript/type entry points on the same native contract', () => {
    for (const path of [
      'src/EnrichedMarkdownTextInput.tsx',
      'lib/module/EnrichedMarkdownTextInput.js',
    ]) {
      const source = additions(path);
      expect(source).toContain('submitOnReturn');
      expect(source).toContain('onSubmit(event.nativeEvent.value)');
    }
    expect(additions('lib/typescript/src/EnrichedMarkdownTextInput.d.ts')).toContain(
      'onSubmit?: (markdown: string) => void;',
    );
  });

  test('consumes iOS soft Return before text mutation while leaving composition and hardware Return as edits', () => {
    const keyboard = additions('ios/input/ENRMInputTextView.mm');
    expect(keyboard).toContain('- (void)insertText:(NSString *)text');
    expect(keyboard).toContain('self.markedTextRange == nil');
    expect(keyboard).toContain('[self.markdownTextInput submitFromKeyboard]');
    expect(keyboard).toContain('[super insertText:text];');
    expect(keyboard).toContain('action:@selector(enrmHardwareReturn:)');
    expect(keyboard).toContain('[super insertText:@"\\n"];');
    const input = additions('ios/input/EnrichedMarkdownTextInput.mm');
    expect(input).toContain('UIReturnKeySend : UIReturnKeyDefault');
    expect(input).toContain('_editSession.isComposing');
    expect(input).toContain('[_inputEventEmitter emitOnSubmit];');
  });

  test('uses Android IME actions rather than text changes and ignores candidate confirmation', () => {
    const input = additions(
      'android/src/main/java/com/swmansion/enriched/markdown/input/EnrichedMarkdownTextInputView.kt',
    );
    expect(input).toContain('setOnEditorActionListener');
    expect(input).toContain('actionId != EditorInfo.IME_ACTION_SEND || event != null');
    expect(input).toContain('BaseInputConnection.getComposingSpanStart(text) < 0');
    expect(input).toContain('eventEmitter.emitSubmit()');
    expect(input).toContain('EditorInfo.IME_FLAG_NO_ENTER_ACTION');
    expect(input).toContain('inputMethodManager?.restartInput(this)');
    expect(input).not.toContain('commitText(');
  });

  test('submits a complete Markdown snapshot and never coalesces Android submit events', () => {
    expect(additions('ios/input/ENRMInputEventEmitter.mm')).toContain(
      'NSString *markdown = [_dataSource currentMarkdown];',
    );
    expect(
      additions(
        'android/src/main/java/com/swmansion/enriched/markdown/input/layout/InputEventEmitter.kt',
      ),
    ).toContain('OnSubmitEvent(surfaceId(), view.id, serializeToMarkdown())');
    expect(
      additions(
        'android/src/main/java/com/swmansion/enriched/markdown/input/events/OnSubmitEvent.kt',
      ),
    ).toContain('override fun canCoalesce(): Boolean = false');
  });

  test.each([
    'ios/generated/ReactCodegen/EnrichedMarkdownTextSpec',
    'android/generated/jni/react/renderer/components/EnrichedMarkdownTextSpec',
  ])('ships the matching native prop and event contract in %s', (base) => {
    expect(additions(`${base}/Props.h`)).toContain('bool submitOnReturn{false};');
    expect(additions(`${base}/Props.cpp`)).toContain('result["submitOnReturn"] = submitOnReturn;');
    expect(additions(`${base}/EventEmitters.h`)).toContain('void onSubmit(OnSubmit value) const;');
    expect(additions(`${base}/EventEmitters.cpp`)).toContain(
      'payload.setProperty(runtime, "value", event.value);',
    );
  });
});
