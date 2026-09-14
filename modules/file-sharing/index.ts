import { requireNativeModule } from 'expo';

type FileSharingModule = {
  shareFiles(urls: string[], mimeType: string, title: string): Promise<void>;
};

export function getFileSharing(): FileSharingModule {
  return requireNativeModule<FileSharingModule>('CherryFileSharing');
}
