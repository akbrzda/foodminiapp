import db from "../../../config/database.js";
import { getIntegrationSettings } from "./integrationConfigService.js";
import { processIikoMenuSync } from "./syncProcessors.js";

const READINESS_STATUS = {
  NOT_CONFIGURED: "not_configured",
  NEEDS_MAPPING: "needs_mapping",
  READY: "ready",
};

const CANDIDATE_STATE = {
  SUGGESTED: "suggested",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  IGNORED: "ignored",
  REQUIRES_REVIEW: "requires_review",
};

const MENU_ENTITY_CONFIG = {
  category: {
    table: "menu_categories",
    idField: "id",
    nameField: "name",
    externalField: "iiko_category_id",
    activeField: "is_active",
    entityType: "category",
  },
  item: {
    table: "menu_items",
    idField: "id",
    nameField: "name",
    externalField: "iiko_item_id",
    activeField: "is_active",
    priceField: "price",
    entityType: "item",
  },
  variant: {
    table: "item_variants",
    idField: "id",
    nameField: "name",
    externalField: "iiko_variant_id",
    activeField: "is_active",
    priceField: "price",
    entityType: "variant",
  },
  modifier: {
    table: "modifiers",
    idField: "id",
    nameField: "name",
    externalField: "iiko_modifier_id",
    activeField: "is_active",
    priceField: "price",
    entityType: "modifier",
  },
};

const STOPLIST_AUTO_REASON = "Синхронизация стоп-листа из iiko";

function normalizeString(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

function normalizeForCompare(value) {
  return normalizeString(value).replace(/["'`.,;:!?()\[\]{}\-_/\\]+/g, " ").replace(/\s+/g, " ").trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function calculatePercent(part, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function parseJsonValue(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
}

function normalizeNullableNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

async function getEntitySnapshot(entityType, entityId, connection = db) {
  const id = toNumber(entityId, 0);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (entityType === "category") {
    const [rows] = await connection.query(
      `SELECT id, name, description, image_url, iiko_category_id AS external_id
       FROM menu_categories
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      name: row.name || "",
      description: row.description || "",
      composition: "",
      price: null,
      calories_per_100g: null,
      proteins_per_100g: null,
      fats_per_100g: null,
      carbs_per_100g: null,
      image_url: row.image_url || "",
      external_id: row.external_id || "",
    };
  }

  if (entityType === "item") {
    const [rows] = await connection.query(
      `SELECT id, name, description, composition, price, image_url,
              calories_per_100g, proteins_per_100g, fats_per_100g, carbs_per_100g,
              iiko_item_id AS external_id
       FROM menu_items
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      name: row.name || "",
      description: row.description || "",
      composition: row.composition || "",
      price: normalizeNullableNumber(row.price),
      calories_per_100g: normalizeNullableNumber(row.calories_per_100g),
      proteins_per_100g: normalizeNullableNumber(row.proteins_per_100g),
      fats_per_100g: normalizeNullableNumber(row.fats_per_100g),
      carbs_per_100g: normalizeNullableNumber(row.carbs_per_100g),
      image_url: row.image_url || "",
      external_id: row.external_id || "",
    };
  }

  if (entityType === "variant") {
    const [rows] = await connection.query(
      `SELECT iv.id, iv.name, iv.price, iv.image_url,
              iv.calories_per_100g, iv.proteins_per_100g, iv.fats_per_100g, iv.carbs_per_100g,
              iv.iiko_variant_id AS external_id,
              mi.name AS item_name, mi.description, mi.composition
       FROM item_variants iv
       LEFT JOIN menu_items mi ON mi.id = iv.item_id
       WHERE iv.id = ?
       LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      name: row.item_name ? `${row.item_name} - ${row.name}` : row.name || "",
      description: row.description || "",
      composition: row.composition || "",
      price: normalizeNullableNumber(row.price),
      calories_per_100g: normalizeNullableNumber(row.calories_per_100g),
      proteins_per_100g: normalizeNullableNumber(row.proteins_per_100g),
      fats_per_100g: normalizeNullableNumber(row.fats_per_100g),
      carbs_per_100g: normalizeNullableNumber(row.carbs_per_100g),
      image_url: row.image_url || "",
      external_id: row.external_id || "",
    };
  }

  if (entityType === "modifier") {
    const [rows] = await connection.query(
      `SELECT m.id, m.name, m.price, m.image_url,
              m.iiko_modifier_id AS external_id
       FROM modifiers m
       WHERE m.id = ?
       LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      name: row.name || "",
      description: "",
      composition: "",
      price: normalizeNullableNumber(row.price),
      calories_per_100g: null,
      proteins_per_100g: null,
      fats_per_100g: null,
      carbs_per_100g: null,
      image_url: row.image_url || "",
      external_id: row.external_id || "",
    };
  }

  return null;
}

async function upsertReadiness({ provider, module, status, totalCount, linkedCount, unlinkedCount, stats, policy = null }) {
  await db.query(
    `INSERT INTO integration_readiness
       (provider, module, status, total_count, linked_count, unlinked_count, stats, policy, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       total_count = VALUES(total_count),
       linked_count = VALUES(linked_count),
       unlinked_count = VALUES(unlinked_count),
       stats = VALUES(stats),
       policy = COALESCE(VALUES(policy), policy),
       last_checked_at = NOW()`,
    [provider, module, status, totalCount, linkedCount, unlinkedCount, JSON.stringify(stats || {}), policy ? JSON.stringify(policy) : null],
  );
}

export async function getReadiness(provider, module) {
  const [rows] = await db.query(
    `SELECT provider, module, status, total_count, linked_count, unlinked_count, stats, policy, last_checked_at, updated_at
     FROM integration_readiness
     WHERE provider = ? AND module = ?
     LIMIT 1`,
    [provider, module],
  );

  if (rows.length === 0) return null;
  return rows[0];
}

export async function listReadiness(provider = "iiko") {
  const [rows] = await db.query(
    `SELECT provider, module, status, total_count, linked_count, unlinked_count, stats, policy, last_checked_at, updated_at
     FROM integration_readiness
     WHERE provider = ?
     ORDER BY module`,
    [provider],
  );
  return rows;
}

async function getMenuReadinessPolicy() {
  const row = await getReadiness("iiko", "menu");
  const policy = parseJsonValue(row?.policy, {});
  const maxUnlinkedPercent = Number(policy?.max_unlinked_percent);
  return {
    maxUnlinkedPercent: Number.isFinite(maxUnlinkedPercent) ? Math.max(0, maxUnlinkedPercent) : 0,
  };
}

async function countMenuEntities(connection = db) {
  const queries = Object.entries(MENU_ENTITY_CONFIG).map(async ([key, config]) => {
    const [rows] = await connection.query(
      `SELECT
         SUM(CASE WHEN ${config.activeField} = 1 THEN 1 ELSE 0 END) AS total_count,
         SUM(CASE WHEN ${config.activeField} = 1 AND COALESCE(NULLIF(TRIM(${config.externalField}), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END) AS linked_count
       FROM ${config.table}`,
    );

    const totalCount = toNumber(rows?.[0]?.total_count, 0);
    const linkedCount = toNumber(rows?.[0]?.linked_count, 0);
    const unlinkedCount = Math.max(totalCount - linkedCount, 0);

    return {
      key,
      totalCount,
      linkedCount,
      unlinkedCount,
      linkedPercent: calculatePercent(linkedCount, totalCount),
    };
  });

  const results = await Promise.all(queries);

  const stats = {
    by_entity: {},
    total: 0,
    linked: 0,
    unlinked: 0,
    linked_percent: 0,
    unlinked_percent: 0,
  };

  for (const entry of results) {
    stats.by_entity[entry.key] = {
      total: entry.totalCount,
      linked: entry.linkedCount,
      unlinked: entry.unlinkedCount,
      linked_percent: entry.linkedPercent,
      unlinked_percent: calculatePercent(entry.unlinkedCount, entry.totalCount),
    };
    stats.total += entry.totalCount;
    stats.linked += entry.linkedCount;
    stats.unlinked += entry.unlinkedCount;
  }

  stats.linked_percent = calculatePercent(stats.linked, stats.total);
  stats.unlinked_percent = calculatePercent(stats.unlinked, stats.total);

  return stats;
}

export async function ensureIikoReadinessSeed() {
  await db.query(
    `INSERT INTO integration_readiness (provider, module, status, total_count, linked_count, unlinked_count, stats, policy, last_checked_at)
     VALUES
       ('iiko', 'menu', 'not_configured', 0, 0, 0, JSON_OBJECT(), JSON_OBJECT('max_unlinked_percent', 0), NOW()),
       ('iiko', 'stoplist', 'not_configured', 0, 0, 0, JSON_OBJECT(), JSON_OBJECT(), NOW())
     ON DUPLICATE KEY UPDATE updated_at = updated_at`,
  );
}

export async function refreshMenuReadiness(options = {}) {
  const { preserveNotConfigured = false } = options;
  const settings = await getIntegrationSettings();
  const menuMode = String(settings?.integrationMode?.menu || "local").trim().toLowerCase();

  if (!settings.iikoEnabled || menuMode !== "external") {
    const stats = { total: 0, linked: 0, unlinked: 0, linked_percent: 0, unlinked_percent: 0, by_entity: {} };
    await upsertReadiness({
      provider: "iiko",
      module: "menu",
      status: READINESS_STATUS.NOT_CONFIGURED,
      totalCount: 0,
      linkedCount: 0,
      unlinkedCount: 0,
      stats,
      policy: { max_unlinked_percent: 0 },
    });
    return {
      provider: "iiko",
      module: "menu",
      status: READINESS_STATUS.NOT_CONFIGURED,
      total_count: 0,
      linked_count: 0,
      unlinked_count: 0,
      stats,
    };
  }

  const currentRow = await getReadiness("iiko", "menu");
  const policy = await getMenuReadinessPolicy();
  const stats = await countMenuEntities();

  let status = READINESS_STATUS.NEEDS_MAPPING;
  if (stats.unlinked === 0 || stats.unlinked_percent <= policy.maxUnlinkedPercent) {
    status = READINESS_STATUS.READY;
  }

  if (preserveNotConfigured && currentRow?.status === READINESS_STATUS.NOT_CONFIGURED) {
    status = READINESS_STATUS.NOT_CONFIGURED;
  }

  await upsertReadiness({
    provider: "iiko",
    module: "menu",
    status,
    totalCount: stats.total,
    linkedCount: stats.linked,
    unlinkedCount: stats.unlinked,
    stats,
    policy,
  });

  return {
    provider: "iiko",
    module: "menu",
    status,
    total_count: stats.total,
    linked_count: stats.linked,
    unlinked_count: stats.unlinked,
    stats,
    policy,
  };
}

export async function refreshStopListReadiness() {
  const settings = await getIntegrationSettings();
  const menuMode = String(settings?.integrationMode?.menu || "local").trim().toLowerCase();

  if (!settings.iikoEnabled || menuMode !== "external") {
    const stats = { synced_entries: 0, unmatched_candidates: 0, linked: 0, unlinked: 0 };
    await upsertReadiness({
      provider: "iiko",
      module: "stoplist",
      status: READINESS_STATUS.NOT_CONFIGURED,
      totalCount: 0,
      linkedCount: 0,
      unlinkedCount: 0,
      stats,
    });
    return {
      provider: "iiko",
      module: "stoplist",
      status: READINESS_STATUS.NOT_CONFIGURED,
      total_count: 0,
      linked_count: 0,
      unlinked_count: 0,
      stats,
    };
  }

  const menuReadiness = (await getReadiness("iiko", "menu")) || (await refreshMenuReadiness());

  const [[stopListRows], [candidateRows]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM menu_stop_list
       WHERE created_by IS NULL
         AND reason = ?`,
      [STOPLIST_AUTO_REASON],
    ),
    db.query(
      `SELECT COUNT(*) AS total
       FROM integration_mapping_candidates
       WHERE provider = 'iiko'
         AND module = 'stoplist'
         AND state IN ('suggested', 'requires_review')`,
    ),
  ]);

  const totalCount = toNumber(stopListRows?.[0]?.total, 0);
  const unmatched = toNumber(candidateRows?.[0]?.total, 0);
  const linkedCount = Math.max(totalCount - unmatched, 0);
  const unlinkedCount = unmatched;

  const status = menuReadiness.status === READINESS_STATUS.READY && unlinkedCount === 0 ? READINESS_STATUS.READY : READINESS_STATUS.NEEDS_MAPPING;
  const stats = {
    synced_entries: totalCount,
    unmatched_candidates: unmatched,
    linked: linkedCount,
    unlinked: unlinkedCount,
  };

  await upsertReadiness({
    provider: "iiko",
    module: "stoplist",
    status,
    totalCount,
    linkedCount,
    unlinkedCount,
    stats,
  });

  return {
    provider: "iiko",
    module: "stoplist",
    status,
    total_count: totalCount,
    linked_count: linkedCount,
    unlinked_count: unlinkedCount,
    stats,
  };
}

export async function refreshIikoReadiness(options = {}) {
  await ensureIikoReadinessSeed();
  const menu = await refreshMenuReadiness(options);
  const stoplist = await refreshStopListReadiness();

  return {
    provider: "iiko",
    modules: {
      menu,
      stoplist,
    },
  };
}

async function loadEntitiesForMatching(entityKey, connection = db) {
  const config = MENU_ENTITY_CONFIG[entityKey];
  if (!config) return { linked: [], unlinked: [] };

  const extraFields = config.priceField ? `, ${config.priceField} AS price` : "";
  const [rows] = await connection.query(
    `SELECT ${config.idField} AS id,
            ${config.nameField} AS name,
            ${config.externalField} AS external_id,
            ${config.activeField} AS is_active
            ${extraFields}
     FROM ${config.table}
     WHERE ${config.activeField} = 1`,
  );

  const linked = [];
  const unlinked = [];
  for (const row of rows) {
    const externalId = String(row.external_id || "").trim();
    const normalized = {
      id: toNumber(row.id, 0),
      name: String(row.name || "").trim(),
      normalizedName: normalizeForCompare(row.name),
      externalId,
      price: row.price !== undefined ? Number(row.price) : null,
    };
    if (externalId) {
      linked.push(normalized);
    } else {
      unlinked.push(normalized);
    }
  }

  return { linked, unlinked };
}

function getBestCandidate(localEntity, linkedEntities) {
  let best = null;

  for (const linkedEntity of linkedEntities) {
    let score = 0;
    let reason = "";

    if (!localEntity.normalizedName || !linkedEntity.normalizedName) {
      continue;
    }

    if (localEntity.normalizedName === linkedEntity.normalizedName) {
      score += 80;
      reason = "exact_name";
    } else if (linkedEntity.normalizedName.includes(localEntity.normalizedName) || localEntity.normalizedName.includes(linkedEntity.normalizedName)) {
      score += 55;
      reason = "name_contains";
    }

    if (Number.isFinite(localEntity.price) && Number.isFinite(linkedEntity.price)) {
      const diff = Math.abs(Number(localEntity.price) - Number(linkedEntity.price));
      if (diff <= 0.01) {
        score += 20;
        reason = reason ? `${reason}+exact_price` : "exact_price";
      } else if (diff <= 10) {
        score += 10;
        reason = reason ? `${reason}+close_price` : "close_price";
      }
    }

    if (!best || score > best.score) {
      best = {
        score,
        reason,
        linkedEntity,
      };
    }
  }

  return best;
}

export async function rebuildMenuMappingCandidates(options = {}) {
  const { minScore = 60 } = options;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `DELETE FROM integration_mapping_candidates
       WHERE provider = 'iiko' AND module = 'menu' AND state IN ('suggested', 'requires_review')`,
    );

    let created = 0;
    let suggested = 0;
    let requiresReview = 0;

    for (const [entityKey, config] of Object.entries(MENU_ENTITY_CONFIG)) {
      const { linked, unlinked } = await loadEntitiesForMatching(entityKey, connection);
      for (const localEntity of unlinked) {
        const best = getBestCandidate(localEntity, linked);

        if (best && best.score >= minScore) {
          const localSnapshot = await getEntitySnapshot(config.entityType, localEntity.id, connection);
          const targetSnapshot = await getEntitySnapshot(config.entityType, best.linkedEntity.id, connection);
          await connection.query(
            `INSERT INTO integration_mapping_candidates
               (provider, module, entity_type, local_entity_type, local_entity_id, local_name,
                external_entity_id, external_context, external_payload, confidence, state, notes)
             VALUES
               ('iiko', 'menu', ?, ?, ?, ?, ?, ?, ?, ?, 'suggested', ?)` ,
            [
              config.entityType,
              config.entityType,
              localEntity.id,
              localEntity.name || null,
              best.linkedEntity.externalId,
              JSON.stringify({
                target_local_id: best.linkedEntity.id,
                matched_by: best.reason,
                score: best.score,
              }),
              JSON.stringify({
                local: localSnapshot,
                external: targetSnapshot,
              }),
              Number(best.score.toFixed(2)),
              `Автоподбор: ${best.reason || "heuristic"}`,
            ],
          );
          suggested += 1;
        } else {
          const localSnapshot = await getEntitySnapshot(config.entityType, localEntity.id, connection);
          await connection.query(
            `INSERT INTO integration_mapping_candidates
               (provider, module, entity_type, local_entity_type, local_entity_id, local_name,
                external_entity_id, external_context, external_payload, confidence, state, notes)
             VALUES
               ('iiko', 'menu', ?, ?, ?, ?, ?, NULL, ?, NULL, 'requires_review', ?)` ,
            [
              config.entityType,
              config.entityType,
              localEntity.id,
              localEntity.name || null,
              `unmatched:${config.entityType}:${localEntity.id}`,
              JSON.stringify({
                local: localSnapshot,
                external: null,
              }),
              "Автоподбор не нашел надежного совпадения",
            ],
          );
          requiresReview += 1;
        }

        created += 1;
      }
    }

    await connection.commit();

    await refreshMenuReadiness();
    await refreshStopListReadiness();

    return {
      created,
      suggested,
      requires_review: requiresReview,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function addStopListUnmatchedCandidates({ externalIds = [], externalContext = {} } = {}) {
  if (!Array.isArray(externalIds) || externalIds.length === 0) return { created: 0 };

  let created = 0;
  for (const rawId of externalIds) {
    const externalId = String(rawId || "").trim();
    if (!externalId) continue;

    const [existsRows] = await db.query(
      `SELECT id
       FROM integration_mapping_candidates
       WHERE provider = 'iiko'
         AND module = 'stoplist'
         AND external_entity_id = ?
         AND state IN ('suggested', 'requires_review')
       LIMIT 1`,
      [externalId],
    );

    if (existsRows.length > 0) continue;

    await db.query(
      `INSERT INTO integration_mapping_candidates
         (provider, module, entity_type, local_entity_type, local_entity_id, local_name,
          external_entity_id, external_context, external_payload, confidence, state, notes)
       VALUES
         ('iiko', 'stoplist', 'stoplist_entity', 'unknown', NULL, NULL,
          ?, ?, NULL, NULL, 'requires_review', ?)`,
      [externalId, JSON.stringify(externalContext || {}), "ID из стоп-листа iiko не найден среди локальных сопоставлений"],
    );

    created += 1;
  }

  await refreshStopListReadiness();

  return { created };
}

export async function listMappingCandidates(params = {}) {
  const provider = String(params.provider || "iiko").trim();
  const module = String(params.module || "menu").trim();
  const state = String(params.state || "").trim();
  const page = Math.max(toNumber(params.page, 1), 1);
  const limit = Math.min(Math.max(toNumber(params.limit, 20), 1), 200);
  const offset = (page - 1) * limit;

  const where = ["provider = ?", "module = ?"];
  const values = [provider, module];

  if (state) {
    where.push("state = ?");
    values.push(state);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const [[countRows], [rows]] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM integration_mapping_candidates ${whereSql}`, values),
    db.query(
      `SELECT id, provider, module, entity_type, local_entity_type, local_entity_id, local_name,
              external_entity_id, external_context, external_payload, confidence, state, notes,
              resolved_by, resolved_at, created_at, updated_at
       FROM integration_mapping_candidates
       ${whereSql}
       ORDER BY FIELD(state, 'requires_review', 'suggested', 'ignored', 'rejected', 'confirmed'), id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    ),
  ]);

  const normalizedRows = rows.map((row) => {
    const payload = parseJsonValue(row.external_payload, {});
    const context = parseJsonValue(row.external_context, {});
    return {
      ...row,
      external_payload: payload,
      external_context: context,
      local_data: payload?.local || null,
      external_data: payload?.external || null,
    };
  });

  return {
    total: toNumber(countRows?.[0]?.total, 0),
    page,
    limit,
    rows: normalizedRows,
  };
}

async function mergeCategoryCandidate(connection, sourceId, targetId) {
  await connection.query(
    `INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order)
     SELECT item_id, ?, sort_order
     FROM menu_item_categories
     WHERE category_id = ?`,
    [targetId, sourceId],
  );

  await connection.query("DELETE FROM menu_item_categories WHERE category_id = ?", [sourceId]);

  await connection.query(
    `INSERT INTO menu_category_cities (category_id, city_id, is_active)
     SELECT ?, city_id, is_active
     FROM menu_category_cities
     WHERE category_id = ?
     ON DUPLICATE KEY UPDATE is_active = GREATEST(menu_category_cities.is_active, VALUES(is_active))`,
    [targetId, sourceId],
  );

  await connection.query("UPDATE menu_categories SET is_active = 0 WHERE id = ?", [sourceId]);
  await connection.query("UPDATE menu_category_cities SET is_active = 0 WHERE category_id = ?", [sourceId]);
}

async function mergeItemCandidate(connection, sourceId, targetId) {
  await connection.query(
    `UPDATE menu_items target
     JOIN menu_items source ON source.id = ?
     SET
       target.image_url = COALESCE(NULLIF(TRIM(source.image_url), ''), target.image_url),
       target.description = COALESCE(NULLIF(TRIM(source.description), ''), target.description),
       target.composition = COALESCE(NULLIF(TRIM(source.composition), ''), target.composition),
       target.sort_order = LEAST(target.sort_order, source.sort_order)
     WHERE target.id = ?`,
    [sourceId, targetId],
  );

  await connection.query(
    `INSERT IGNORE INTO menu_item_tags (item_id, tag_id)
     SELECT ?, tag_id
     FROM menu_item_tags
     WHERE item_id = ?`,
    [targetId, sourceId],
  );

  await connection.query(
    `INSERT IGNORE INTO menu_item_categories (item_id, category_id, sort_order)
     SELECT ?, category_id, sort_order
     FROM menu_item_categories
     WHERE item_id = ?`,
    [targetId, sourceId],
  );

  await connection.query(
    `INSERT INTO menu_item_cities (item_id, city_id, is_active)
     SELECT ?, city_id, is_active
     FROM menu_item_cities
     WHERE item_id = ?
     ON DUPLICATE KEY UPDATE is_active = GREATEST(menu_item_cities.is_active, VALUES(is_active))`,
    [targetId, sourceId],
  );

  await connection.query(
    `INSERT INTO menu_item_prices (item_id, city_id, fulfillment_type, price)
     SELECT ?, city_id, fulfillment_type, price
     FROM menu_item_prices
     WHERE item_id = ?
     ON DUPLICATE KEY UPDATE price = VALUES(price)`,
    [targetId, sourceId],
  );

  await connection.query(
    `INSERT IGNORE INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_at, created_by)
     SELECT branch_id, entity_type, ?, fulfillment_types, reason, auto_remove, remove_at, created_at, created_by
     FROM menu_stop_list
     WHERE entity_type = 'item' AND entity_id = ?`,
    [targetId, sourceId],
  );

  await connection.query("DELETE FROM menu_stop_list WHERE entity_type = 'item' AND entity_id = ?", [sourceId]);

  await connection.query("UPDATE menu_items SET is_active = 0 WHERE id = ?", [sourceId]);
  await connection.query("UPDATE menu_item_cities SET is_active = 0 WHERE item_id = ?", [sourceId]);
}

async function mergeVariantCandidate(connection, sourceId, targetId) {
  await connection.query(
    `INSERT INTO menu_modifier_variant_prices (modifier_id, variant_id, price, weight, weight_unit)
     SELECT modifier_id, ?, price, weight, weight_unit
     FROM menu_modifier_variant_prices
     WHERE variant_id = ?
     ON DUPLICATE KEY UPDATE
       price = VALUES(price),
       weight = VALUES(weight),
       weight_unit = VALUES(weight_unit)`,
    [targetId, sourceId],
  );

  await connection.query(
    `INSERT IGNORE INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_at, created_by)
     SELECT branch_id, entity_type, ?, fulfillment_types, reason, auto_remove, remove_at, created_at, created_by
     FROM menu_stop_list
     WHERE entity_type = 'variant' AND entity_id = ?`,
    [targetId, sourceId],
  );

  await connection.query("DELETE FROM menu_stop_list WHERE entity_type = 'variant' AND entity_id = ?", [sourceId]);
  await connection.query("UPDATE item_variants SET is_active = 0 WHERE id = ?", [sourceId]);
}

async function mergeModifierCandidate(connection, sourceId, targetId) {
  await connection.query(
    `INSERT IGNORE INTO menu_item_disabled_modifiers (item_id, modifier_id)
     SELECT item_id, ?
     FROM menu_item_disabled_modifiers
     WHERE modifier_id = ?`,
    [targetId, sourceId],
  );

  await connection.query(
    `INSERT INTO menu_modifier_variant_prices (modifier_id, variant_id, price, weight, weight_unit)
     SELECT ?, variant_id, price, weight, weight_unit
     FROM menu_modifier_variant_prices
     WHERE modifier_id = ?
     ON DUPLICATE KEY UPDATE
       price = VALUES(price),
       weight = VALUES(weight),
       weight_unit = VALUES(weight_unit)`,
    [targetId, sourceId],
  );

  await connection.query(
    `INSERT IGNORE INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_at, created_by)
     SELECT branch_id, entity_type, ?, fulfillment_types, reason, auto_remove, remove_at, created_at, created_by
     FROM menu_stop_list
     WHERE entity_type = 'modifier' AND entity_id = ?`,
    [targetId, sourceId],
  );

  await connection.query("DELETE FROM menu_stop_list WHERE entity_type = 'modifier' AND entity_id = ?", [sourceId]);
  await connection.query("UPDATE modifiers SET is_active = 0 WHERE id = ?", [sourceId]);
}

async function applyMenuMerge(candidate, resolvedBy, targetLocalIdOverride = null) {
  const localEntityId = toNumber(candidate.local_entity_id, 0);
  const externalContext = parseJsonValue(candidate.external_context, {});
  const targetLocalId = toNumber(targetLocalIdOverride || externalContext?.target_local_id, 0);

  if (!Number.isFinite(localEntityId) || localEntityId <= 0) {
    throw new Error("Кандидат не содержит локальную сущность для сопоставления");
  }
  if (!Number.isFinite(targetLocalId) || targetLocalId <= 0) {
    throw new Error("Кандидат не содержит целевую сущность для слияния");
  }
  if (targetLocalId === localEntityId) {
    throw new Error("Нельзя сопоставить сущность саму с собой");
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (candidate.entity_type === "category") {
      await mergeCategoryCandidate(connection, localEntityId, targetLocalId);
    } else if (candidate.entity_type === "item") {
      await mergeItemCandidate(connection, localEntityId, targetLocalId);
    } else if (candidate.entity_type === "variant") {
      await mergeVariantCandidate(connection, localEntityId, targetLocalId);
    } else if (candidate.entity_type === "modifier") {
      await mergeModifierCandidate(connection, localEntityId, targetLocalId);
    } else {
      throw new Error("Неподдерживаемый тип сущности для сопоставления");
    }

    await connection.query(
      `UPDATE integration_mapping_candidates
       SET state = ?, resolved_by = ?, resolved_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [CANDIDATE_STATE.CONFIRMED, resolvedBy || null, candidate.id],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deactivateAllUnlinkedMenuEntities() {
  await db.query("UPDATE menu_categories SET is_active = 0 WHERE COALESCE(NULLIF(TRIM(iiko_category_id), ''), NULL) IS NULL");
  await db.query("UPDATE menu_category_cities mcc JOIN menu_categories mc ON mc.id = mcc.category_id SET mcc.is_active = 0 WHERE mc.is_active = 0");

  await db.query("UPDATE menu_items SET is_active = 0 WHERE COALESCE(NULLIF(TRIM(iiko_item_id), ''), NULL) IS NULL");
  await db.query("UPDATE menu_item_cities mic JOIN menu_items mi ON mi.id = mic.item_id SET mic.is_active = 0 WHERE mi.is_active = 0");

  await db.query("UPDATE item_variants SET is_active = 0 WHERE COALESCE(NULLIF(TRIM(iiko_variant_id), ''), NULL) IS NULL");
  await db.query("UPDATE modifiers SET is_active = 0 WHERE COALESCE(NULLIF(TRIM(iiko_modifier_id), ''), NULL) IS NULL");
}

async function clearLocalMenuCatalogByDelete() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query("DELETE FROM menu_stop_list");
    await connection.query("DELETE FROM menu_modifier_prices");
    await connection.query("DELETE FROM menu_modifier_variant_prices");
    await connection.query("DELETE FROM menu_variant_prices");
    await connection.query("DELETE FROM item_modifier_groups");
    await connection.query("DELETE FROM menu_item_disabled_modifiers");
    await connection.query("DELETE FROM menu_item_prices");
    await connection.query("DELETE FROM menu_item_tags");
    await connection.query("DELETE FROM menu_item_categories");
    await connection.query("DELETE FROM menu_item_cities");
    await connection.query("DELETE FROM menu_category_cities");
    await connection.query("DELETE FROM item_variants");
    await connection.query("DELETE FROM modifiers");
    await connection.query("DELETE FROM modifier_groups");
    await connection.query("DELETE FROM menu_items");
    await connection.query("DELETE FROM menu_categories");

    await connection.query("DELETE FROM integration_mapping_candidates WHERE provider = 'iiko' AND module IN ('menu', 'stoplist')");

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function resolveMappingCandidate({ candidateId, action, resolvedBy, targetLocalId = null }) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  if (!["confirm", "ignore", "reject"].includes(normalizedAction)) {
    throw new Error("Некорректное действие сопоставления");
  }

  const [rows] = await db.query(
    `SELECT id, provider, module, entity_type, local_entity_type, local_entity_id, local_name,
            external_entity_id, external_context, confidence, state
     FROM integration_mapping_candidates
     WHERE id = ?
     LIMIT 1`,
    [candidateId],
  );

  if (rows.length === 0) {
    throw new Error("Кандидат сопоставления не найден");
  }

  const candidate = rows[0];

  if (normalizedAction === "confirm") {
    if (candidate.module === "menu") {
      await applyMenuMerge(candidate, resolvedBy, targetLocalId);
    } else {
      await db.query(
        `UPDATE integration_mapping_candidates
         SET state = ?, resolved_by = ?, resolved_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [CANDIDATE_STATE.CONFIRMED, resolvedBy || null, candidate.id],
      );
    }
  } else {
    const nextState = normalizedAction === "ignore" ? CANDIDATE_STATE.IGNORED : CANDIDATE_STATE.REJECTED;
    await db.query(
      `UPDATE integration_mapping_candidates
       SET state = ?, resolved_by = ?, resolved_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [nextState, resolvedBy || null, candidate.id],
    );
  }

  await refreshIikoReadiness();

  return {
    id: candidate.id,
    action: normalizedAction,
    module: candidate.module,
  };
}

export async function listManualMappingTargets({ entityType, query = "", limit = 50 }) {
  const normalizedEntityType = String(entityType || "")
    .trim()
    .toLowerCase();
  const normalizedQuery = String(query || "").trim();
  const normalizedLimit = Math.min(Math.max(toNumber(limit, 50), 1), 200);

  const configByEntityType = {
    category: {
      table: "menu_categories",
      idField: "id",
      nameField: "name",
      externalField: "iiko_category_id",
      imageField: "image_url",
      descriptionField: "description",
      compositionField: "NULL",
      priceField: "NULL",
      caloriesField: "NULL",
      proteinsField: "NULL",
      fatsField: "NULL",
      carbsField: "NULL",
    },
    item: {
      table: "menu_items",
      idField: "id",
      nameField: "name",
      externalField: "iiko_item_id",
      imageField: "image_url",
      descriptionField: "description",
      compositionField: "composition",
      priceField: "price",
      caloriesField: "calories_per_100g",
      proteinsField: "proteins_per_100g",
      fatsField: "fats_per_100g",
      carbsField: "carbs_per_100g",
    },
    variant: {
      table: "item_variants",
      idField: "id",
      nameField: "name",
      externalField: "iiko_variant_id",
      imageField: "image_url",
      descriptionField: "NULL",
      compositionField: "NULL",
      priceField: "price",
      caloriesField: "calories_per_100g",
      proteinsField: "proteins_per_100g",
      fatsField: "fats_per_100g",
      carbsField: "carbs_per_100g",
    },
    modifier: {
      table: "modifiers",
      idField: "id",
      nameField: "name",
      externalField: "iiko_modifier_id",
      imageField: "image_url",
      descriptionField: "NULL",
      compositionField: "NULL",
      priceField: "price",
      caloriesField: "NULL",
      proteinsField: "NULL",
      fatsField: "NULL",
      carbsField: "NULL",
    },
  };

  const config = configByEntityType[normalizedEntityType];
  if (!config) {
    return { rows: [], total: 0 };
  }

  const where = [
    `COALESCE(NULLIF(TRIM(${config.externalField}), ''), NULL) IS NOT NULL`,
    `COALESCE(is_active, 1) = 1`,
  ];
  const values = [];

  if (normalizedQuery) {
    where.push(`${config.nameField} LIKE ?`);
    values.push(`%${normalizedQuery}%`);
  }

  const [rows] = await db.query(
    `SELECT ${config.idField} AS id,
            ${config.nameField} AS name,
            ${config.externalField} AS external_id,
            ${config.imageField} AS image_url,
            ${config.descriptionField} AS description,
            ${config.compositionField} AS composition,
            ${config.priceField} AS price,
            ${config.caloriesField} AS calories_per_100g,
            ${config.proteinsField} AS proteins_per_100g,
            ${config.fatsField} AS fats_per_100g,
            ${config.carbsField} AS carbs_per_100g
     FROM ${config.table}
     WHERE ${where.join(" AND ")}
     ORDER BY ${config.nameField}
     LIMIT ?`,
    [...values, normalizedLimit],
  );

  return {
    total: rows.length,
    rows: rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name || "").trim(),
      external_id: String(row.external_id || "").trim(),
      image_url: row.image_url || "",
      description: row.description || "",
      composition: row.composition || "",
      price: normalizeNullableNumber(row.price),
      calories_per_100g: normalizeNullableNumber(row.calories_per_100g),
      proteins_per_100g: normalizeNullableNumber(row.proteins_per_100g),
      fats_per_100g: normalizeNullableNumber(row.fats_per_100g),
      carbs_per_100g: normalizeNullableNumber(row.carbs_per_100g),
    })),
  };
}

async function autoResolveMenuCandidates({ scoreThreshold = 85, resolvedBy = null } = {}) {
  const [rows] = await db.query(
    `SELECT id
     FROM integration_mapping_candidates
     WHERE provider = 'iiko'
       AND module = 'menu'
       AND state = 'suggested'
       AND confidence >= ?
     ORDER BY confidence DESC, id ASC`,
    [scoreThreshold],
  );

  let confirmed = 0;
  for (const row of rows) {
    try {
      await resolveMappingCandidate({ candidateId: row.id, action: "confirm", resolvedBy });
      confirmed += 1;
    } catch (error) {
      // Мягко пропускаем конфликтные кейсы, они остаются в ручной разбор.
    }
  }

  return { confirmed };
}

export async function executeIikoOnboardingAction({ action, adminUserId = null }) {
  const normalizedActionRaw = String(action || "").trim().toLowerCase();
  const normalizedAction = normalizedActionRaw === "replace" ? "delete" : normalizedActionRaw;
  if (!["merge", "delete", "defer"].includes(normalizedAction)) {
    throw new Error("Некорректное действие мастера интеграции");
  }

  await ensureIikoReadinessSeed();

  if (normalizedAction === "defer") {
    const menuReadiness = await refreshMenuReadiness({ preserveNotConfigured: false });
    const status = menuReadiness.unlinked_count > 0 ? READINESS_STATUS.NEEDS_MAPPING : READINESS_STATUS.READY;

    await upsertReadiness({
      provider: "iiko",
      module: "menu",
      status,
      totalCount: menuReadiness.total_count,
      linkedCount: menuReadiness.linked_count,
      unlinkedCount: menuReadiness.unlinked_count,
      stats: menuReadiness.stats,
      policy: menuReadiness.policy || { max_unlinked_percent: 0 },
    });

    await refreshStopListReadiness();
    return {
      action: normalizedAction,
      readiness: await refreshIikoReadiness(),
    };
  }

  if (normalizedAction === "delete") {
    await clearLocalMenuCatalogByDelete();
  }

  await processIikoMenuSync(`onboarding_${normalizedAction}`);

  const candidatesResult = await rebuildMenuMappingCandidates({
    minScore: normalizedAction === "delete" ? 80 : 60,
  });

  let autoResolved = { confirmed: 0 };
  if (normalizedAction === "delete") {
    autoResolved = await autoResolveMenuCandidates({ scoreThreshold: 85, resolvedBy: adminUserId || null });
    await deactivateAllUnlinkedMenuEntities();
  }

  const readiness = await refreshIikoReadiness();

  return {
    action: normalizedAction,
    candidates: candidatesResult,
    auto_resolved: autoResolved,
    readiness,
  };
}
