import type { LocalOcrModelId } from '@/shared/contracts/localOcr';

export type LocalOcrModel = {
  version: string;
  files: readonly { name: string; url: string; bytes: number; sha256: string }[];
};

// Pin community conversions and both LFS digests together. Never resolve mutable /main weights.
const xiaomiBaseUrl =
  'https://huggingface.co/prithivMLmods/Xiaomi-OCR-0-GGUF/resolve/0f0e77db7c97c409bb87347e6c2f151829651947';
const ovisBaseUrl =
  'https://huggingface.co/prithivMLmods/ATH-MaaS-OvisOCR3-GGUF/resolve/c29551652e828085ca1e892092f1319dbee22d2f';

export const LOCAL_OCR_MODELS = {
  xiaomi: {
    version: 'xiaomi-ocr-0-q4km-0f0e77db-v1',
    files: [
      {
        name: 'model.gguf',
        url: `${xiaomiBaseUrl}/Xiaomi-OCR-0.Q4_K_M.gguf`,
        bytes: 529_297_664,
        sha256: '1e497ff06b91a3d822c543066df3e9ef69c62c5423be09d739dfa1db55630d3a',
      },
      {
        name: 'vision.gguf',
        url: `${xiaomiBaseUrl}/Xiaomi-OCR-0.mmproj-bf16.gguf`,
        bytes: 207_346_624,
        sha256: '634d6bc95781ebf4a3f06570a59859fa5082d488db540fd474bc6b4061aec90e',
      },
    ],
  },
  ovis: {
    version: 'ovis-ocr3-q4km-c2955165-v1',
    files: [
      {
        name: 'model.gguf',
        url: `${ovisBaseUrl}/OvisOCR3.Q4_K_M.gguf`,
        bytes: 529_297_568,
        sha256: 'c7b0faf006f146883dedaf1e3c886088e3a36eb8abbbb21f95122ec5c0166e1e',
      },
      {
        name: 'vision.gguf',
        url: `${ovisBaseUrl}/OvisOCR3.mmproj-bf16.gguf`,
        bytes: 207_346_432,
        sha256: 'b75172bce7c24944f02b8dd6cf434b3d027b7cd89f94cde73dfd07f863d281ec',
      },
    ],
  },
} satisfies Record<LocalOcrModelId, LocalOcrModel>;
