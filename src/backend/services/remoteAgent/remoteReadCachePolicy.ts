export const REMOTE_READ_CACHE_POLICY = {
  maxInactiveSessions: 10,
  idleMs: 5 * 60_000,
  maxBytes: 32 * 1024 * 1024,
  maxValueBytes: 1024 * 1024,
  concurrency: 4,
};
