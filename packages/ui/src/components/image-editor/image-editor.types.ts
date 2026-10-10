export type ImageCrop = { x: number; y: number; width: number; height: number };
export type ImageEdit = { crop: ImageCrop; rotation: 0 | 90 | 180 | 270 };

export type ImageEditorLabels = {
  cancel: string;
  done: string;
  loading: string;
  saving: string;
  title: string;
  hint: string;
  reset: string;
  rotate: string;
  cropLeft: string;
  cropRight: string;
  cropTop: string;
  cropBottom: string;
};
