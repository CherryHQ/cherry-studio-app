export type ImageCrop = { x: number; y: number; width: number; height: number };
export type ImageEdit = {
  crop: ImageCrop;
  rotation: 0 | 90 | 180 | 270;
  straighten: number;
  horizontal: number;
  vertical: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
};

export type ImageEditGeometry = {
  matrix: number[];
  width: number;
  height: number;
  bounds: ImageCrop;
};

export type ImageEditorLabels = {
  cancel: string;
  done: string;
  loading: string;
  saving: string;
  title: string;
  reset: string;
  rotate: string;
  undo: string;
  redo: string;
  aspect: string;
  aspectRatio: string;
  direction: string;
  perspective: string;
  compare: string;
  zero: string;
  increase: (label: string) => string;
  decrease: (label: string) => string;
  free: string;
  original: string;
  screen: string;
  screenLandscape: string;
  straighten: string;
  horizontal: string;
  vertical: string;
  flipHorizontal: string;
  flipVertical: string;
  cropLeft: string;
  cropRight: string;
  cropTop: string;
  cropBottom: string;
};
