import * as z from 'zod';

export const DeepseekServicesSchema = z.object({
  providerId: z.string().min(1).nullable(),
  apiHost: z
    .url({ protocol: /^https?$/ })
    .refine((value) => {
      const url = new URL(value);
      return !url.username && !url.password && !url.search && !url.hash;
    })
    .transform((value) => value.replace(/\/+$/, '').replace(/\/v1$/, '')),
  search: z.boolean(),
  ocr: z.boolean(),
  files: z.boolean(),
  nativeTools: z.boolean(),
  safetyCheck: z.boolean(),
  voice: z.enum(['stella', 'tide']),
});

export type DeepseekServices = z.infer<typeof DeepseekServicesSchema>;

export const DEFAULT_DEEPSEEK_SERVICES: DeepseekServices = {
  providerId: null,
  apiHost: 'https://api.deepseek.com',
  search: false,
  ocr: false,
  files: false,
  nativeTools: false,
  safetyCheck: false,
  voice: 'stella',
};
