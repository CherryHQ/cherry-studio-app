import { loadPhotoPreviewPage } from '../photoLibrary';

const mockQueryExe = jest.fn();
const mockQueryExeForMetadata = jest.fn();
const mockAssetGetFilename = jest.fn();
const mockAssetGetUri = jest.fn();

jest.mock('expo-media-library', () => ({
  AssetField: {
    CREATION_TIME: 'creationTime',
    MEDIA_TYPE: 'mediaType',
  },
  MediaType: {
    IMAGE: 'image',
  },
  Query: class {
    eq() {
      return this;
    }

    exe() {
      return mockQueryExe();
    }

    exeForMetadata() {
      return mockQueryExeForMetadata();
    }

    limit() {
      return this;
    }

    offset() {
      return this;
    }

    orderBy() {
      return this;
    }
  },
}));

describe('photo library paging', () => {
  beforeEach(() => {
    mockQueryExe.mockReset();
    mockQueryExeForMetadata.mockReset();
    mockAssetGetFilename.mockReset();
    mockAssetGetUri.mockReset();
  });

  test('loads a preview page with one metadata query and no per-asset URI extraction', async () => {
    const assets = Array.from({ length: 60 }, (_, index) => ({
      getFilename: () => mockAssetGetFilename(`photo-${index}.jpg`),
      getUri: () => mockAssetGetUri(`file://photo-${index}.jpg`),
      id: `ph://photo-${index}`,
    }));
    const metadata = assets.map((asset, index) => ({
      creationTime: index,
      duration: null,
      filename: `photo-${index}.jpg`,
      height: 100,
      id: asset.id,
      isFavorite: false,
      mediaType: 'image',
      modificationTime: index,
      width: 100,
    }));
    mockQueryExe.mockResolvedValue(assets);
    mockQueryExeForMetadata.mockResolvedValue(metadata);

    const page = await loadPhotoPreviewPage(0);

    expect(page.photoPreviews).toHaveLength(60);
    expect(mockQueryExeForMetadata).toHaveBeenCalledTimes(1);
    expect(mockQueryExe).not.toHaveBeenCalled();
    expect(mockAssetGetFilename).not.toHaveBeenCalled();
    expect(mockAssetGetUri).not.toHaveBeenCalled();
  });
});
