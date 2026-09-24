import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FileEntrySchema } from '@/shared/data/types/file';

import { FileEntryImage } from '../FileEntryImage';

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { previewUri: 'file:///preview.png' }, isPending: false }),
}));
jest.mock('@/frontend/data', () => ({
  queryKeys: { files: { previewUri: () => ['preview'] } },
  useBackendModule: () => ({ generatePreviewUri: jest.fn() }),
}));
jest.mock('../hooks/useOpenFileEntry', () => ({
  useOpenFileEntry: () => ({ openFileEntry: jest.fn() }),
}));
jest.mock('../PreviewImage', () => ({
  PreviewImage: (props: object) => jest.requireActual('react').createElement('PreviewImage', props),
}));
jest.mock('react-native-gesture-handler', () => ({
  Pressable: (props: object) => jest.requireActual('react').createElement('Pressable', props),
}));

const entry = FileEntrySchema.parse({
  createdAt: 1,
  filename: 'generated.png',
  id: '00000000-0000-7000-8000-000000000001',
  mediaType: 'image/png',
  provenance: 'generated',
  size: 1,
  updatedAt: 1,
});

test('keeps the reserved ratio when the decoded image matches it', () => {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(
      <FileEntryImage entry={entry} initialAspectRatio={16 / 9} uri="file:///image.png" />,
    );
  });
  expect(renderer!.root.findByType(View).props.style.aspectRatio).toBe(16 / 9);

  act(() => {
    renderer!.root.findByType('PreviewImage').props.onLoad({
      source: { width: 1600, height: 900 },
    });
  });
  expect(renderer!.root.findByType(View).props.style.aspectRatio).toBe(16 / 9);
});

test('adopts the decoded ratio when the provider returns another shape', () => {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(
      <FileEntryImage entry={entry} initialAspectRatio={16 / 9} uri="file:///image.png" />,
    );
  });

  act(() => {
    renderer!.root.findByType('PreviewImage').props.onLoad({
      source: { width: 1024, height: 1024 },
    });
  });
  expect(renderer!.root.findByType(View).props.style.aspectRatio).toBe(1);
});

test('continues to size other images from their decoded dimensions', () => {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(<FileEntryImage entry={entry} uri="file:///image.png" />);
  });
  expect(renderer!.root.findByType(View).props.style.aspectRatio).toBe(1);

  act(() => {
    renderer!.root.findByType('PreviewImage').props.onLoad({
      source: { width: 1600, height: 900 },
    });
  });
  expect(renderer!.root.findByType(View).props.style.aspectRatio).toBe(16 / 9);
});
