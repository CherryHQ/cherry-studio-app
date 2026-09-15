import type { WorkbookRenderModel } from './renderModel';

/** The parser owns MIME admission; this scope owns every temporary browser URL. */
export function createWorkbookImageUrls(images: WorkbookRenderModel['images']) {
  const urls: Record<number, string> = {};
  const dispose = () => {
    for (const id of Object.keys(urls)) {
      URL.revokeObjectURL(urls[Number(id)]);
      delete urls[Number(id)];
    }
  };
  try {
    for (const [id, image] of Object.entries(images)) {
      urls[Number(id)] = URL.createObjectURL(new Blob([image.data], { type: image.mime }));
    }
    return { urls, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
