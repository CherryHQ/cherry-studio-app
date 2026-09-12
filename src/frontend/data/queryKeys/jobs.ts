export const jobQueryKeys = {
  all: () => ['/jobs'] as const,
  detail: (jobId: string) => [`/jobs/${jobId}`] as const,
};
