import db from "../../../config/database.js";

const fromJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const mapCampaignRow = (row) => ({
  ...row,
  is_active: Boolean(row.is_active),
  city_id: row.city_id ? Number(row.city_id) : null,
  branch_id: row.branch_id ? Number(row.branch_id) : null,
  segment_config: fromJson(row.segment_config),
});

const mapSlideRow = (row) => ({
  ...row,
  is_active: Boolean(row.is_active),
});

const toSegmentConfig = (value) => {
  if (!value) return null;
  return JSON.stringify(value);
};

const applyPlacementFilter = ({ placement, cityId, branchId }) => {
  const where = ["c.status = 'active'", "c.placement = ?"];
  const params = [placement];

  where.push("(c.start_at IS NULL OR c.start_at <= UTC_TIMESTAMP())");
  where.push("(c.end_at IS NULL OR c.end_at >= UTC_TIMESTAMP())");

  if (Number.isInteger(cityId) && cityId > 0) {
    where.push("(c.city_id IS NULL OR c.city_id = ?)");
    params.push(cityId);
  } else {
    where.push("c.city_id IS NULL");
  }

  if (Number.isInteger(branchId) && branchId > 0) {
    where.push("(c.branch_id IS NULL OR c.branch_id = ?)");
    params.push(branchId);
  } else {
    where.push("c.branch_id IS NULL");
  }

  return { where, params };
};

export const listStoriesCampaigns = async ({ page, limit, search, status, placement }) => {
  const where = [];
  const params = [];

  if (search) {
    where.push("(c.name LIKE ? OR c.title LIKE ?)");
    const likeValue = `%${search}%`;
    params.push(likeValue, likeValue);
  }

  if (status) {
    where.push("c.status = ?");
    params.push(status);
  }

  if (placement) {
    where.push("c.placement = ?");
    params.push(placement);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [items] = await db.query(
    `SELECT
      c.id, c.name, c.title, c.placement, c.status, c.is_active, c.priority,
      c.cover_image_url, c.start_at, c.end_at, c.city_id, c.branch_id, c.segment_config,
      c.created_by, c.created_at, c.updated_at,
      (SELECT COUNT(*) FROM stories_slides s WHERE s.campaign_id = c.id AND s.is_active = 1) AS slides_count,
      (SELECT COUNT(*) FROM stories_impressions i WHERE i.campaign_id = c.id) AS impressions_count,
      (SELECT COUNT(DISTINCT i.user_id) FROM stories_impressions i WHERE i.campaign_id = c.id) AS unique_impressions_count,
      (SELECT COUNT(*) FROM stories_clicks cl WHERE cl.campaign_id = c.id) AS clicks_count,
      (SELECT COUNT(*) FROM stories_user_state us WHERE us.campaign_id = c.id AND us.completed_at IS NOT NULL) AS completions_count
    FROM stories_campaigns c
    ${whereSql}
    ORDER BY c.priority DESC, c.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [totals] = await db.query(
    `SELECT COUNT(*) AS total
     FROM stories_campaigns c
     ${whereSql}`,
    params
  );

  return {
    items: items.map(mapCampaignRow),
    total: Number(totals[0]?.total || 0),
  };
};

export const getStoriesDashboardStats = async () => {
  const [rows] = await db.query(
    `SELECT
      (SELECT COUNT(*) FROM stories_campaigns) AS total_campaigns,
      (SELECT COUNT(*) FROM stories_campaigns WHERE status = 'active') AS active_campaigns,
      (SELECT COUNT(*) FROM stories_impressions) AS impressions,
      (SELECT COUNT(DISTINCT user_id) FROM stories_impressions) AS unique_impressions,
      (SELECT COUNT(*) FROM stories_clicks) AS clicks,
      (SELECT COUNT(*) FROM stories_user_state WHERE completed_at IS NOT NULL) AS completions`
  );

  const stats = rows[0] || {};
  const impressions = Number(stats.impressions || 0);
  const clicks = Number(stats.clicks || 0);

  return {
    total_campaigns: Number(stats.total_campaigns || 0),
    active_campaigns: Number(stats.active_campaigns || 0),
    impressions,
    unique_impressions: Number(stats.unique_impressions || 0),
    clicks,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    completions: Number(stats.completions || 0),
  };
};

export const getStoriesCampaignById = async (campaignId) => {
  const [campaignRows] = await db.query(
    `SELECT
      c.id, c.name, c.title, c.placement, c.status, c.is_active, c.priority,
      c.cover_image_url, c.start_at, c.end_at, c.city_id, c.branch_id, c.segment_config,
      c.created_by, c.created_at, c.updated_at
     FROM stories_campaigns c
     WHERE c.id = ?
     LIMIT 1`,
    [campaignId]
  );

  if (!campaignRows.length) return null;

  const [slideRows] = await db.query(
    `SELECT
      s.id, s.campaign_id, s.title, s.subtitle, s.media_url,
      s.cta_text, s.cta_type, s.cta_value, s.duration_seconds, s.sort_order, s.is_active,
      s.created_at, s.updated_at
     FROM stories_slides s
     WHERE s.campaign_id = ?
     ORDER BY s.sort_order ASC, s.id ASC`,
    [campaignId]
  );

  return {
    ...mapCampaignRow(campaignRows[0]),
    slides: slideRows.map(mapSlideRow),
  };
};

const insertSlides = async (connection, campaignId, slides) => {
  for (const slide of slides) {
    await connection.query(
      `INSERT INTO stories_slides
        (campaign_id, title, subtitle, media_url, cta_text, cta_type, cta_value, duration_seconds, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        campaignId,
        slide.title,
        slide.subtitle || null,
        slide.media_url,
        slide.cta_text || null,
        slide.cta_type || "none",
        slide.cta_value || null,
        slide.duration_seconds,
        slide.sort_order,
        slide.is_active ? 1 : 0,
      ]
    );
  }
};

export const createStoriesCampaign = async (payload) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO stories_campaigns
        (name, title, placement, status, is_active, priority, cover_image_url, start_at, end_at, city_id, branch_id, segment_config, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.name,
        payload.title,
        payload.placement,
        payload.status,
        payload.is_active ? 1 : 0,
        payload.priority,
        payload.cover_image_url || null,
        payload.start_at,
        payload.end_at,
        payload.city_id,
        payload.branch_id,
        toSegmentConfig(payload.segment_config),
        payload.created_by,
      ]
    );

    await insertSlides(connection, result.insertId, payload.slides);
    await connection.commit();

    return getStoriesCampaignById(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateStoriesCampaign = async (campaignId, payload) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const updates = [];
    const values = [];
    const pushUpdate = (field, value) => {
      updates.push(`${field} = ?`);
      values.push(value);
    };

    if (payload.name !== undefined) pushUpdate("name", payload.name);
    if (payload.title !== undefined) pushUpdate("title", payload.title);
    if (payload.placement !== undefined) pushUpdate("placement", payload.placement);
    if (payload.status !== undefined) pushUpdate("status", payload.status);
    if (payload.is_active !== undefined) pushUpdate("is_active", payload.is_active ? 1 : 0);
    if (payload.priority !== undefined) pushUpdate("priority", payload.priority);
    if (payload.cover_image_url !== undefined) pushUpdate("cover_image_url", payload.cover_image_url || null);
    if (payload.start_at !== undefined) pushUpdate("start_at", payload.start_at);
    if (payload.end_at !== undefined) pushUpdate("end_at", payload.end_at);
    if (payload.city_id !== undefined) pushUpdate("city_id", payload.city_id);
    if (payload.branch_id !== undefined) pushUpdate("branch_id", payload.branch_id);
    if (payload.segment_config !== undefined) {
      pushUpdate("segment_config", toSegmentConfig(payload.segment_config));
    }

    if (updates.length > 0) {
      values.push(campaignId);
      await connection.query(
        `UPDATE stories_campaigns SET ${updates.join(", ")} WHERE id = ?`,
        values
      );
    }

    if (Array.isArray(payload.slides)) {
      await connection.query("DELETE FROM stories_slides WHERE campaign_id = ?", [campaignId]);
      await insertSlides(connection, campaignId, payload.slides);
    }

    await connection.commit();
    return getStoriesCampaignById(campaignId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const setStoriesCampaignActive = async (campaignId, isActive) => {
  await db.query(
    "UPDATE stories_campaigns SET status = ?, is_active = ? WHERE id = ?",
    [isActive ? "active" : "paused", isActive ? 1 : 0, campaignId]
  );
  return getStoriesCampaignById(campaignId);
};

export const getStoriesMenuReferences = async () => {
  const [categories] = await db.query(
    `SELECT id, name
     FROM menu_categories
     WHERE is_active = 1
     ORDER BY name ASC
     LIMIT 1000`
  );

  const [products] = await db.query(
    `SELECT id, name
     FROM menu_items
     WHERE is_active = 1
     ORDER BY name ASC
     LIMIT 2000`
  );

  return {
    categories: categories.map((item) => ({
      id: Number(item.id),
      name: item.name || "",
    })),
    products: products.map((item) => ({
      id: Number(item.id),
      name: item.name || "",
    })),
  };
};

export const listActiveStoriesForUser = async ({ userId, placement, cityId, branchId }) => {
  const { where, params } = applyPlacementFilter({ placement, cityId, branchId });

  const [campaignRows] = await db.query(
    `SELECT
      c.id, c.name, c.title, c.placement, c.status, c.is_active, c.priority,
      c.cover_image_url, c.start_at, c.end_at, c.city_id, c.branch_id, c.segment_config,
      c.created_by, c.created_at, c.updated_at
    FROM stories_campaigns c
    WHERE ${where.join(" AND ")}
    ORDER BY c.priority DESC, c.created_at DESC`,
    params
  );

  if (!campaignRows.length) {
    return [];
  }

  const campaignIds = campaignRows.map((row) => Number(row.id));
  const placeholders = campaignIds.map(() => "?").join(",");

  const [slideRows] = await db.query(
    `SELECT
      s.id, s.campaign_id, s.title, s.subtitle, s.media_url,
      s.cta_text, s.cta_type, s.cta_value, s.duration_seconds, s.sort_order, s.is_active,
      s.created_at, s.updated_at
    FROM stories_slides s
    WHERE s.campaign_id IN (${placeholders}) AND s.is_active = 1
    ORDER BY s.campaign_id ASC, s.sort_order ASC, s.id ASC`,
    campaignIds
  );

  const [stateRows] = await db.query(
    `SELECT
      us.campaign_id, us.last_slide_index, us.completed_at, us.last_viewed_at, us.views_count
    FROM stories_user_state us
    WHERE us.user_id = ? AND us.campaign_id IN (${placeholders})`,
    [userId, ...campaignIds]
  );

  const slidesByCampaign = new Map();
  for (const slide of slideRows) {
    const key = Number(slide.campaign_id);
    if (!slidesByCampaign.has(key)) slidesByCampaign.set(key, []);
    slidesByCampaign.get(key).push(mapSlideRow(slide));
  }

  const stateByCampaign = new Map();
  for (const state of stateRows) {
    stateByCampaign.set(Number(state.campaign_id), state);
  }

  return campaignRows.map((campaign) => {
    const campaignId = Number(campaign.id);
    const state = stateByCampaign.get(campaignId);
    return {
      ...mapCampaignRow(campaign),
      slides: slidesByCampaign.get(campaignId) || [],
      state: {
        last_slide_index: Number(state?.last_slide_index || 0),
        completed_at: state?.completed_at || null,
        last_viewed_at: state?.last_viewed_at || null,
        views_count: Number(state?.views_count || 0),
      },
      is_viewed: Boolean(state?.last_viewed_at),
    };
  });
};

export const createStoryImpression = async ({ userId, campaignId, slideId, placement, platform }) => {
  await db.query(
    `INSERT INTO stories_impressions (campaign_id, slide_id, user_id, placement, platform)
     VALUES (?, ?, ?, ?, ?)`,
    [campaignId, slideId || null, userId, placement, platform]
  );

  await db.query(
    `INSERT INTO stories_user_state (user_id, campaign_id, last_slide_index, last_viewed_at)
     VALUES (?, ?, 0, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE last_viewed_at = UTC_TIMESTAMP()`,
    [userId, campaignId]
  );
};

export const createStoryClick = async ({ userId, campaignId, slideId, placement, platform, ctaType, ctaValue }) => {
  await db.query(
    `INSERT INTO stories_clicks (campaign_id, slide_id, user_id, placement, platform, cta_type, cta_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [campaignId, slideId || null, userId, placement, platform, ctaType, ctaValue || null]
  );
};

export const completeStoryCampaign = async ({ userId, campaignId, lastSlideIndex }) => {
  await db.query(
    `INSERT INTO stories_user_state (user_id, campaign_id, last_slide_index, completed_at, last_viewed_at, views_count)
     VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1)
     ON DUPLICATE KEY UPDATE
       last_slide_index = VALUES(last_slide_index),
       completed_at = UTC_TIMESTAMP(),
       last_viewed_at = UTC_TIMESTAMP(),
       views_count = views_count + 1`,
    [userId, campaignId, lastSlideIndex]
  );
};

export default {
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
};
