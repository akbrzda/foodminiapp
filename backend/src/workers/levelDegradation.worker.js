const CHECK_INTERVAL_MS = 10 * 60 * 1000;
let intervalId = null;

export function createLevelDegradationWorker() {
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(() => {}, CHECK_INTERVAL_MS);
    },
    stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    },
  };
}

export default {
  createLevelDegradationWorker,
};
