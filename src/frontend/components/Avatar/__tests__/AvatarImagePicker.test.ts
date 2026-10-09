import { readFileSync } from 'node:fs';

// Avatar selection is the only picker call site with `allowsEditing`, so it owns the
// Android crop-failure guard. Rendering still needs device acceptance.
describe('expo-image-picker Android crop patch', () => {
  test('returns the picker error instead of asserting a crop output uri', () => {
    const patch = readFileSync(`${process.cwd()}/patches/expo-image-picker@57.0.16.patch`, 'utf8');

    expect(patch).toContain('-    val targetUri = requireNotNull(result.uriContent)');
    expect(patch).toContain('+    if (resultCode != Activity.RESULT_OK) {');
    expect(patch).toContain(
      '+    val targetUri = result.uriContent ?: return ImagePickerContractResult.Error',
    );
  });

  test('builds the patched module from source instead of the prebuilt artifact', () => {
    const { expo } = JSON.parse(readFileSync(`${process.cwd()}/package.json`, 'utf8')) as {
      expo: { autolinking: { android: { buildFromSource: string[] } } };
    };

    expect(expo.autolinking.android.buildFromSource).toContain('expo-image-picker');
  });
});
