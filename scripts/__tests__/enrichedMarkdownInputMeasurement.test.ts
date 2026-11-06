import { readFileSync } from 'node:fs';

const root = 'node_modules/react-native-enriched-markdown/ios';
const read = (file: string) => readFileSync(`${root}/${file}`, 'utf8');

// Wiring guards for the installed native patch. The separate .mm fixture and
// Duo acceptance exercise threading and layout; these guards do not prove them.
describe('Enriched Markdown input measurement patch', () => {
  test('layout consumes owned text instead of synchronously reading a UIKit view', () => {
    const node = read('input/internals/EnrichedMarkdownTextInputShadowNode.mm');
    const state = read('input/internals/EnrichedMarkdownTextInputState.h');
    expect(node).toContain('getStateData().getMeasurementText()');
    expect(node).toContain('ENRMMeasureInputText(text, layoutConstraints.maximumSize.width)');
    expect(node).not.toMatch(
      /dispatch_sync|dispatch_get_main_queue|setupMockInputView|getComponentViewRef/,
    );
    expect(state).not.toContain('viewRef_');
    expect(state).toContain('measurementText_(std::move(measurementText))');
  });

  test('initial layout reuses input parsing and formatting without constructing a view', () => {
    const node = read('input/internals/EnrichedMarkdownTextInputShadowNode.mm');
    expect(node).toContain('parseToPlainTextAndRanges:');
    expect(node).toContain('applyFormattingRanges:parsed.formattingRanges toTextStorage:storage');
    expect(node).toContain('applyBlockRanges:parsed.blockRanges toTextStorage:storage');
    expect(node).toContain('applyInputStyleProps(style, props, defaultProps, false)');
    expect(node).not.toMatch(/\[\[?(?:UITextView|EnrichedMarkdownTextInput)\s+(?:alloc|new)\]/);
  });

  test('publishes text snapshots for edits and initial/style/direction changes', () => {
    const view = read('input/EnrichedMarkdownTextInput.mm');
    expect(view).toContain(
      'ENRMInputMeasurementText(ENRMGetAttributedText(_textView), _textView.typingAttributes)',
    );
    expect(view).toContain(
      'EnrichedMarkdownTextInputState(++_heightUpdateCounter, wrapManagedObject(text))',
    );
    expect(view).toContain('styleChanged || writingDirectionChanged || importedDefaultValue');
    expect(view).not.toContain('ENRMRequestHeightUpdate<EnrichedMarkdownTextInputState>');
  });

  test('does not share mutable attachments or paragraph attributes with layout', () => {
    const measurement = read('input/ENRMInputMeasurement.mm');
    expect(measurement).toContain('result[key] = [value copy]');
    expect(measurement).toContain('@"ENRMInputMeasurement" : @YES');
    expect(measurement).toContain('[NSValue valueWithCGRect:attachment.bounds]');
    expect(measurement).toContain('attachment.bounds = bounds.CGRectValue');
    expect(measurement).toContain('return [snapshot copy]');
    expect(measurement).not.toMatch(/dispatch_sync|dispatch_get_main_queue|UITextView/);
  });
});
