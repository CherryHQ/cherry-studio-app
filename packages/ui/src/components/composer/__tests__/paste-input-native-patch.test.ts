import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const source = readFileSync(
  join(dirname(require.resolve('expo-paste-input/package.json')), 'ios/ExpoPasteInputView.swift'),
  'utf8',
);

// Installed-source upgrade guards. Jest cannot replay UIKit clipboard-service
// stalls; these protect the native loading policy, not device responsiveness.
describe('expo-paste-input iOS clipboard patch', () => {
  test('selects representations without synchronous clipboard payload reads', () => {
    expect(source).toContain('let itemProviders = UIPasteboard.general.itemProviders');
    expect(source).toContain('let registeredTypes = provider.registeredTypeIdentifiers');
    expect(source).toContain('UTType($0)?.conforms(to: .image) == true');
    expect(source).not.toMatch(
      /(?:pasteboard|UIPasteboard\.general)\.(?:items|string|image|images|data|value|hasImages|hasStrings)\b/,
    );

    const menuCheck = source
      .split('// Swizzle canPerformAction (once per class)')[1]
      ?.split('// Swizzle paste method (once per class)')[0];
    expect(menuCheck).toBeDefined();
    expect(menuCheck).not.toContain('UIPasteboard.general');
  });

  test('preserves raw GIFs and falls back asynchronously when a representation fails', () => {
    expect(source).toContain('private static let gifTypes = ["com.compuserve.gif"');
    expect(source).toContain('private static let imageTypes = gifTypes + [');
    expect(source).toContain('provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier)');
    expect(source).toContain('typeIdentifiers: typeIdentifiers.dropFirst()');
    expect(source).toContain('provider.loadObject(ofClass: UIImage.self)');
    expect(source).toContain('return .gif(data)');
    expect(source).toContain('case .gif(let data):');
    expect(source).toContain('writeTemporaryGIF(data)');
  });

  test('rejects corrupt or mislabelled GIF bytes before ending representation fallback', () => {
    const loading = source
      .split('private func loadImagePayload(')[1]
      ?.split('private func enqueuePasteboardContent(')[0];
    expect(loading).toMatch(
      /mediaProcessingQueue\.async[\s\S]*if error == nil, let data,\s*!isGifRepresentation \|\| self\.isGIFData\(data\),\s*let imageSource = CGImageSourceCreateWithData[\s\S]*CGImageSourceGetCount\(imageSource\) > 0,[\s\S]*completion\(payload\)\s*\} else \{[\s\S]*typeIdentifiers: typeIdentifiers\.dropFirst\(\)/,
    );
    expect(loading).toContain('Self.gifTypes.contains(typeIdentifier)');
    expect(loading).toContain('UTType(typeIdentifier)?.conforms(to: .gif) == true');
  });

  test('reserves consecutive paste batches at initiation and advances them in FIFO order', () => {
    const enqueue = source
      .split('private func enqueuePasteboardContent(')[1]
      ?.split('private func processPasteboardContent(')[0];
    expect(enqueue).toMatch(
      /pendingPasteBatches\.append\(providers\)\s*if pendingPasteBatches\.count == 1 \{\s*processPasteboardContent/,
    );
    const processing = source
      .split('private func processPasteboardContent(')[1]
      ?.split('private func isGIFData(')[0];
    expect(processing).toMatch(
      /emitImagesAsync\(for: payloads\)[\s\S]*pendingPasteBatches\.removeFirst\(\)\s*if let nextProviders = pendingPasteBatches\.first \{\s*processPasteboardContent\(nextProviders\[/,
    );
    expect(processing).toContain('pasteGeneration == generation');
  });

  test('loads each image item once in clipboard order and keeps text insertion with the editor', () => {
    expect(source).toContain('let nextPayloads = payload.map { payloads + [$0] } ?? payloads');
    expect(source).toContain('providers.dropFirst(), payloads: nextPayloads');
    expect(source).toContain('originalFunction(object, pasteSelector, sender)');
    expect(source).toContain('provider.loadObject(ofClass: NSString.self)');
  });

  test('writes media off the main thread and drops callbacks for a detached or replaced input', () => {
    const emission = source
      .split('private func emitImagesAsync(for payloads: [MediaPayload]) {')[1]
      ?.split('private func sanitizeAttachments')[0];
    expect(emission).toMatch(/mediaProcessingQueue\.async[\s\S]*temporaryFileURIs/);
    expect(emission).toMatch(
      /DispatchQueue\.main\.async[\s\S]*self\.isMonitoring,\s*self\.textInputView === textInput, self\.pasteGeneration == generation[\s\S]*self\.emitImages/,
    );
    expect(source).toContain('guard isMonitoring, textInputView === textInput else');
    const restoration = source
      .split('private func restoreTextInput(_ view: UIView) {')[1]
      ?.split('private func swizzleTextInputMethods(')[0];
    expect(restoration).toMatch(/pasteGeneration \+= 1\s*pendingPasteBatches\.removeAll\(\)/);
  });
});
