import {
  listStoriesCampaigns,
  getStoriesDashboardStats,
  getStoriesCampaignById,
  createStoriesCampaign,
  updateStoriesCampaign,
  setStoriesCampaignActive,
  getStoriesMenuReferences,
  listActiveStoriesForUser,
  createStoryImpression,
  createStoryClick,
  completeStoryCampaign,
} from "../repositories/storiesRepository.js";
import {
  normalizeStoriesListQuery,
  normalizeStoriesCampaignPayload,
  normalizeActiveStoriesQuery,
  normalizeImpressionPayload,
  normalizeClickPayload,
  normalizeCompletePayload,
} from "../validators/storiesValidators.js";

const resolveClientPlatform = (req) => {
  const headerPlatform = String(req.headers["x-miniapp-platform"] || "").trim().toLowerCase();
  if (["telegram", "max"].includes(headerPlatform)) return headerPlatform;
  return "unknown";
};

const calcPagination = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.max(Math.ceil(total / limit), 1),
});

export const getAdminStoriesList = async (query) => {
  const normalizedQuery = normalizeStoriesListQuery(query);
  const { items, total } = await listStoriesCampaigns(normalizedQuery);
  return {
    items,
    pagination: calcPagination(total, normalizedQuery.page, normalizedQuery.limit),
  };
};

export const getAdminStoriesDashboard = async () => {
  return getStoriesDashboardStats();
};

export const getAdminStoriesMenuReferences = async () => {
  return getStoriesMenuReferences();
};

export const getAdminStoryById = async (campaignId) => {
  return getStoriesCampaignById(campaignId);
};

export const createAdminStory = async (payload, adminId) => {
  const normalizedPayload = normalizeStoriesCampaignPayload(payload, { isUpdate: false });
  return createStoriesCampaign({
    ...normalizedPayload,
    created_by: adminId,
  });
};

export const updateAdminStory = async (campaignId, payload) => {
  const normalizedPayload = normalizeStoriesCampaignPayload(payload, { isUpdate: true });
  return updateStoriesCampaign(campaignId, normalizedPayload);
};

export const toggleAdminStory = async (campaignId, isActive) => {
  return setStoriesCampaignActive(campaignId, Boolean(isActive));
};

export const getActiveStories = async ({ userId, query }) => {
  const normalizedQuery = normalizeActiveStoriesQuery(query);
  const items = await listActiveStoriesForUser({
    userId,
    placement: normalizedQuery.placement,
    cityId: normalizedQuery.cityId,
    branchId: normalizedQuery.branchId,
  });

  return {
    placement: normalizedQuery.placement,
    items,
  };
};

export const trackStoryImpression = async ({ req, userId, payload }) => {
  const normalizedPayload = normalizeImpressionPayload(payload);
  await createStoryImpression({
    userId,
    campaignId: normalizedPayload.campaignId,
    slideId: normalizedPayload.slideId,
    placement: normalizedPayload.placement,
    platform: resolveClientPlatform(req),
  });
};

export const trackStoryClick = async ({ req, userId, payload }) => {
  const normalizedPayload = normalizeClickPayload(payload);
  await createStoryClick({
    userId,
    campaignId: normalizedPayload.campaignId,
    slideId: normalizedPayload.slideId,
    placement: normalizedPayload.placement,
    platform: resolveClientPlatform(req),
    ctaType: normalizedPayload.ctaType,
    ctaValue: normalizedPayload.ctaValue,
  });
};

export const completeStory = async ({ userId, payload }) => {
  const normalizedPayload = normalizeCompletePayload(payload);
  await completeStoryCampaign({
    userId,
    campaignId: normalizedPayload.campaignId,
    lastSlideIndex: normalizedPayload.lastSlideIndex,
  });
};
