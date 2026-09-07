import * as DocumentPicker from 'expo-document-picker';
import { useCallback } from 'react';

export type FileUploadSelection = {
  mediaType?: string;
  name: string;
  size?: number;
  uri: string;
};

/**
 * The app-wide system entry point for choosing files to import. Consumers own
 * what happens after selection: the composer stages attachments, while a file
 * library surface can import the same normalized sources directly.
 */
export function useFileUploadPicker() {
  return useCallback(async (): Promise<FileUploadSelection[]> => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: '*/*',
    });

    if (result.canceled) {
      return [];
    }

    return result.assets.map((asset) => ({
      ...(asset.mimeType === undefined ? {} : { mediaType: asset.mimeType }),
      name: asset.name,
      ...(asset.size === undefined ? {} : { size: asset.size }),
      uri: asset.uri,
    }));
  }, []);
}
