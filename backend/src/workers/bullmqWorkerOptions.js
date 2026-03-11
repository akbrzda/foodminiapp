const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const BULLMQ_WORKER_OPTIONS = {
  lockDuration: toPositiveInt(process.env.BULLMQ_WORKER_LOCK_DURATION_MS, 120000),
  maxStalledCount: toPositiveInt(process.env.BULLMQ_WORKER_MAX_STALLED_COUNT, 3),
  drainDelay: toPositiveInt(process.env.BULLMQ_WORKER_DRAIN_DELAY_S, 5),
};

export default BULLMQ_WORKER_OPTIONS;
