// Pin the community conversion and both LFS digests together. Never resolve mutable /main weights.
// https://huggingface.co/prithivMLmods/Xiaomi-OCR-0-GGUF/tree/0f0e77db7c97c409bb87347e6c2f151829651947
export const LOCAL_OCR_MODEL_VERSION = 'xiaomi-ocr-0-q4km-0f0e77db-v1';
const baseUrl =
  'https://huggingface.co/prithivMLmods/Xiaomi-OCR-0-GGUF/resolve/0f0e77db7c97c409bb87347e6c2f151829651947';

export const LOCAL_OCR_MODEL_FILES = [
  {
    name: 'model.gguf',
    url: `${baseUrl}/Xiaomi-OCR-0.Q4_K_M.gguf`,
    bytes: 529_297_664,
    sha256: '1e497ff06b91a3d822c543066df3e9ef69c62c5423be09d739dfa1db55630d3a',
  },
  {
    name: 'vision.gguf',
    url: `${baseUrl}/Xiaomi-OCR-0.mmproj-bf16.gguf`,
    bytes: 207_346_624,
    sha256: '634d6bc95781ebf4a3f06570a59859fa5082d488db540fd474bc6b4061aec90e',
  },
] as const;

export const LOCAL_OCR_MODEL_BYTES = LOCAL_OCR_MODEL_FILES.reduce(
  (sum, file) => sum + file.bytes,
  0,
);
