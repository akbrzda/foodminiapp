import { createHash } from "crypto";
import redis from "../../../config/redis.js";
import {
  getCandidates,
  getCartAssociationStats,
  getCartCategoryIds,
  getPreferredVariants,
  getUserItemStats,
} from "./upsell/dataProvider.js";

const MAX_LIMIT = 5;
const DEFAULT_LIMIT = 3;
const ROTATION_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_CACHE_TTL_SECONDS = 2 * 60 * 60;
const MAX_CACHE_TTL_SECONDS = 24 * 60 * 60;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
};

const getTimeScore = (name) => {
  const hour = new Date().getHours();
  const lowerName = String(name || "").toLowerCase();
  const morning = hour >= 6 && hour <= 11;
  const evening = hour >= 18 && hour <= 23;

  if (morning && /(кофе|чай|десерт|круассан|сироп)/.test(lowerName)) return 0.25;
  if (evening && /(соус|напит|снек|фри|закуска)/.test(lowerName)) return 0.25;
  return 0;
};

const pickByWeightWithCategoryDiversity = (items, limit) => {
  const pool = [...items];
  const selected = [];
  const selectedCategories = new Set();

  while (pool.length > 0 && selected.length < limit) {
    const unseenCategoryPool = pool.filter((item) => item.category_id && !selectedCategories.has(item.category_id));
    const eligiblePool = unseenCategoryPool.length > 0 ? unseenCategoryPool : pool;
    const totalWeight = eligiblePool.reduce((sum, item) => sum + Math.max(item.score, 0.1), 0);

    let cursor = Math.random() * totalWeight;
    let pickedItem = eligiblePool[0];

    for (let i = 0; i < eligiblePool.length; i += 1) {
      cursor -= Math.max(eligiblePool[i].score, 0.1);
      if (cursor <= 0) {
        pickedItem = eligiblePool[i];
        break;
      }
    }

    selected.push(pickedItem);
    if (pickedItem.category_id) {
      selectedCategories.add(pickedItem.category_id);
    }
    const indexInPool = pool.findIndex((item) => item.id === pickedItem.id);
    if (indexInPool >= 0) {
      pool.splice(indexInPool, 1);
    } else {
      pool.shift();
    }
  }

  return selected;
};

const getCacheTtlSeconds = () => {
  const raw = Number.parseInt(process.env.UPSELL_CACHE_TTL_SECONDS || "", 10);
  if (!Number.isInteger(raw) || raw <= 0) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }
  return Math.min(raw, MAX_CACHE_TTL_SECONDS);
};

const getCartSignature = (cartItems) => {
  const normalized = cartItems
    .map((item) => {
      const id = toNumber(item.item_id ?? item.id);
      if (!Number.isInteger(id)) return null;
      const price = Number(item.price) || 0;
      return `${id}:${Math.round(price * 100)}`;
    })
    .filter(Boolean)
    .sort();

  return createHash("sha1").update(normalized.join("|")).digest("hex");
};

const getUpsellCacheKey = ({ userId, cityId, branchId, fulfillmentType, limit, cartSignature }) => {
  return [
    "upsell",
    "cache",
    `user:${userId || "guest"}`,
    `city:${cityId}`,
    `branch:${branchId || 0}`,
    `fulfillment:${fulfillmentType}`,
    `limit:${limit}`,
    `cart:${cartSignature}`,
  ].join(":");
};

const getRotationMap = async (userId, candidateIds) => {
  if (!userId || candidateIds.length === 0) return new Map();

  const rotationKey = `upsell:rotation:user:${userId}`;
  const values = await redis.hmget(rotationKey, ...candidateIds.map(String));
  const map = new Map();

  for (let i = 0; i < candidateIds.length; i += 1) {
    const seenCount = Number.parseInt(values[i] || "0", 10);
    map.set(candidateIds[i], Number.isInteger(seenCount) ? seenCount : 0);
  }

  return map;
};

const updateRotation = async (userId, itemIds) => {
  if (!userId || itemIds.length === 0) return;

  const rotationKey = `upsell:rotation:user:${userId}`;
  const pipeline = redis.pipeline();
  itemIds.forEach((id) => pipeline.hincrby(rotationKey, String(id), 1));
  pipeline.expire(rotationKey, ROTATION_TTL_SECONDS);
  await pipeline.exec();
};

const buildQuickAddCandidates = (rawCandidates, variantMap) => {
  return rawCandidates
    .filter((item) => !item.has_required_modifiers)
    .map((item) => {
      if (!item.has_variants) {
        return {
          ...item,
          price: item.min_price,
          variant_id: null,
          variant_name: null,
        };
      }

      const selectedVariant = variantMap.get(item.id);
      if (!selectedVariant) return null;

      return {
        ...item,
        price: selectedVariant.price,
        image_url: selectedVariant.image_url || item.image_url,
        variant_id: selectedVariant.variant_id,
        variant_name: selectedVariant.variant_name,
      };
    })
    .filter(Boolean);
};

const scoreCandidates = ({ candidates, cartAvgPrice, associationStats, userStats, cartCategoryIds, rotationStats }) => {
  return candidates.map((candidate) => {
    const associationBoost = Math.min((associationStats.get(candidate.id) || 0) * 0.35, 3);
    const userItemBoost = Math.min((userStats.itemStats.get(candidate.id) || 0) * 0.5, 2.5);
    const userCategoryBoost = Math.min((userStats.categoryStats.get(candidate.category_id) || 0) * 0.2, 1.5);
    const cartCategoryBoost = candidate.category_id && cartCategoryIds.has(candidate.category_id) ? 0.9 : 0;

    let priceBoost = 0;
    if (Number.isFinite(cartAvgPrice) && cartAvgPrice > 0) {
      if (candidate.price <= cartAvgPrice * 0.6) priceBoost = 0.6;
      else if (candidate.price <= cartAvgPrice * 1.1) priceBoost = 0.35;
    }

    const timeBoost = getTimeScore(candidate.name);
    const seenPenalty = Math.min((rotationStats.get(candidate.id) || 0) * 0.9, 2.7);
    const randomBoost = Math.random() * 0.35;

    return {
      ...candidate,
      score: 1 + associationBoost + userItemBoost + userCategoryBoost + cartCategoryBoost + priceBoost + timeBoost + randomBoost - seenPenalty,
    };
  });
};

export const getDynamicUpsell = async ({
  cityId,
  branchId = null,
  fulfillmentType = "delivery",
  cartItems = [],
  userId = null,
  limit = DEFAULT_LIMIT,
}) => {
  const safeLimit = normalizeLimit(limit);
  const cartItemIds = [...new Set(cartItems.map((item) => toNumber(item.item_id ?? item.id)).filter(Number.isInteger))];
  if (cartItemIds.length === 0) return [];
  const cartSignature = getCartSignature(cartItems);
  const cacheKey = getUpsellCacheKey({
    userId,
    cityId,
    branchId,
    fulfillmentType,
    limit: safeLimit,
    cartSignature,
  });
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      await redis.del(cacheKey);
    }
  }

  const cartAvgPrice = cartItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0) / Math.max(cartItems.length, 1);

  const [rawCandidates, cartCategoryIds, associationStats, userStats] = await Promise.all([
    getCandidates({ cityId, branchId, fulfillmentType, cartItemIds }),
    getCartCategoryIds(cartItemIds),
    getCartAssociationStats(cartItemIds),
    getUserItemStats(userId),
  ]);

  const variantItemIds = rawCandidates.filter((item) => item.has_variants).map((item) => item.id);
  const variantMap = await getPreferredVariants({ itemIds: variantItemIds, cityId, fulfillmentType, branchId });

  const quickAddCandidates = buildQuickAddCandidates(rawCandidates, variantMap);
  if (quickAddCandidates.length === 0) return [];

  const candidateIds = quickAddCandidates.map((candidate) => candidate.id);
  const rotationStats = await getRotationMap(userId, candidateIds);

  const scored = scoreCandidates({
    candidates: quickAddCandidates,
    cartAvgPrice,
    associationStats,
    userStats,
    cartCategoryIds,
    rotationStats,
  }).sort((left, right) => right.score - left.score);

  const topPool = scored.slice(0, 30);
  const picked = pickByWeightWithCategoryDiversity(topPool, safeLimit);
  if (userId) {
    await updateRotation(userId, picked.map((item) => item.id));
  }

  const payload = picked.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    image_url: item.image_url,
    price: item.price,
    category_id: item.category_id,
    variant_id: item.variant_id,
    variant_name: item.variant_name,
    has_variants: Boolean(item.variant_id),
  }));

  await redis.set(cacheKey, JSON.stringify(payload), "EX", getCacheTtlSeconds());
  return payload;
};
