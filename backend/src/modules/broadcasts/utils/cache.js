import redis from "../../../config/redis.js";

const SEGMENT_SIZE_TTL_SECONDS = 60 * 60 * 24;
const USER_BROADCAST_TTL_SECONDS = 60 * 60;
const ACTIVE_TRIGGERS_TTL_SECONDS = 60 * 60;

export const getSegmentSizeCacheKey = (segmentId) => `segment:size:${segmentId}`;
export const getUserBroadcastCacheKey = (userId) => `user:broadcast:${userId}`;
export const getActiveTriggersCacheKey = () => "triggers:active";

export async function getCachedSegmentSize(segmentId) {
  if (!segmentId) return null;
  const cached = await redis.get(getSegmentSizeCacheKey(segmentId));
  if (!cached) return null;
  const parsed = Number(cached);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export async function setCachedSegmentSize(segmentId, size, ttlSeconds = SEGMENT_SIZE_TTL_SECONDS) {
  if (!segmentId || !Number.isFinite(size)) return;
  await redis.set(getSegmentSizeCacheKey(segmentId), String(size), "EX", ttlSeconds);
}

export async function invalidateSegmentSize(segmentId) {
  if (!segmentId) return;
  await redis.del(getSegmentSizeCacheKey(segmentId));
}

export async function getCachedUserBroadcast(userId) {
  if (!userId) return null;
  const cached = await redis.get(getUserBroadcastCacheKey(userId));
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (error) {
    return null;
  }
}

export async function setCachedUserBroadcast(userId, payload, ttlSeconds = USER_BROADCAST_TTL_SECONDS) {
  if (!userId) return;
  await redis.set(getUserBroadcastCacheKey(userId), JSON.stringify(payload || {}), "EX", ttlSeconds);
}

export async function getCachedActiveTriggers() {
  const cached = await redis.get(getActiveTriggersCacheKey());
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (error) {
    return null;
  }
}

export async function setCachedActiveTriggers(payload, ttlSeconds = ACTIVE_TRIGGERS_TTL_SECONDS) {
  await redis.set(getActiveTriggersCacheKey(), JSON.stringify(payload || []), "EX", ttlSeconds);
}

export default {
  getSegmentSizeCacheKey,
  getUserBroadcastCacheKey,
  getActiveTriggersCacheKey,
  getCachedSegmentSize,
  setCachedSegmentSize,
  invalidateSegmentSize,
  getCachedUserBroadcast,
  setCachedUserBroadcast,
  getCachedActiveTriggers,
  setCachedActiveTriggers,
};
