import db from "../../../../config/database.js";
import redis from "../../../../config/redis.js";
import { getIikoClientOrNull } from "../integrationConfigService.js";
import { INTEGRATION_MODULE, INTEGRATION_TYPE } from "../../constants.js";
import { logIntegrationEvent } from "../integrationLoggerService.js";
import { notifyMenuUpdated } from "../../../../websocket/runtime.js";
import { buildStopListEntryMap, resolveStopListEntityMaps } from "./iiko-stoplist.helpers.js";

const IIKO_STOPLIST_SYNC_REASON = "Синхронизация стоп-листа из iiko";

async function invalidatePublicMenuCache() {
  try {
    const keys = await redis.keys("menu:*:city:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    // Не критично для завершения sync: данные уже записаны в БД.
  }
}

async function loadTargetBranches(branchId = null) {
  const requestedBranchId = Number(branchId);
  const branchFilter = Number.isFinite(requestedBranchId) && requestedBranchId > 0 ? requestedBranchId : null;
  const [branches] = await db.query(
    `SELECT id, iiko_terminal_group_id
     FROM branches
     WHERE (? IS NULL OR id = ?)
       AND iiko_terminal_group_id IS NOT NULL
       AND iiko_terminal_group_id <> ''`,
    [branchFilter, branchFilter],
  );

  const targetBranches = branches.map((row) => ({
    id: Number(row.id),
    terminalGroupId: String(row.iiko_terminal_group_id || "").trim(),
  }));
  const targetBranchIds = targetBranches.map((row) => row.id).filter(Number.isFinite);

  return {
    branchFilter,
    targetBranches,
    targetBranchIds,
  };
}

async function applyIikoStopListPayloadSync(data, { reason = "manual", branchId = null, source = "sync" } = {}) {
  const startedAt = Date.now();

  const { targetBranches, targetBranchIds } = await loadTargetBranches(branchId);
  const { entryMap, allExternalIdsSet } = buildStopListEntryMap(data, targetBranches, IIKO_STOPLIST_SYNC_REASON);
  const allExternalIds = [...allExternalIdsSet];
  const { itemIdMap, variantIdMap, modifierIdMap } = await resolveStopListEntityMaps(db, allExternalIds);

  let updatedCount = 0;
  let matchedCount = 0;
  let removedCount = 0;
  const unmatchedExternalIds = new Set();

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (targetBranchIds.length > 0) {
      const branchPlaceholders = targetBranchIds.map(() => "?").join(",");
      const [deleteResult] = await connection.query(
        `DELETE FROM menu_stop_list
         WHERE branch_id IN (${branchPlaceholders})
           AND created_by IS NULL
           AND reason = ?`,
        [...targetBranchIds, IIKO_STOPLIST_SYNC_REASON],
      );
      removedCount = Number(deleteResult?.affectedRows || 0);
    }

    for (const branch of targetBranches) {
      const branchScopedEntries = new Map();
      const mergeEntries = (sourceMap) => {
        if (!sourceMap) return;
        for (const [externalId, meta] of sourceMap.entries()) {
          const existing = branchScopedEntries.get(externalId) || null;
          if (!existing) {
            branchScopedEntries.set(externalId, meta);
            continue;
          }
          const existingTs = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
          const nextTs = meta?.createdAt ? new Date(meta.createdAt).getTime() : 0;
          branchScopedEntries.set(externalId, {
            reason: meta?.reason || existing.reason || IIKO_STOPLIST_SYNC_REASON,
            createdAt: nextTs > existingTs ? meta.createdAt : existing.createdAt,
          });
        }
      };

      mergeEntries(entryMap.get("") || null);
      mergeEntries(entryMap.get(branch.terminalGroupId) || null);

      for (const [externalId, stopMeta] of branchScopedEntries.entries()) {
        const itemId = itemIdMap.get(externalId);
        const variantId = variantIdMap.get(externalId);
        const modifierId = modifierIdMap.get(externalId);

        let entityType = null;
        let entityId = null;
        if (Number.isFinite(itemId)) {
          entityType = "item";
          entityId = itemId;
        } else if (Number.isFinite(variantId)) {
          entityType = "variant";
          entityId = variantId;
        } else if (Number.isFinite(modifierId)) {
          entityType = "modifier";
          entityId = modifierId;
        }

        if (!entityType || !Number.isFinite(entityId)) {
          unmatchedExternalIds.add(externalId);
          continue;
        }
        matchedCount += 1;

        await connection.query(
          `INSERT INTO menu_stop_list (branch_id, entity_type, entity_id, fulfillment_types, reason, auto_remove, remove_at, created_by, created_at)
           VALUES (?, ?, ?, NULL, ?, 0, NULL, NULL, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE
             fulfillment_types = NULL,
             reason = VALUES(reason),
             auto_remove = 0,
             remove_at = NULL,
             created_by = NULL,
             created_at = VALUES(created_at)`,
          [branch.id, entityType, entityId, stopMeta?.reason || IIKO_STOPLIST_SYNC_REASON, stopMeta?.createdAt || null],
        );
        updatedCount += 1;
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (unmatchedExternalIds.size > 0) {
    const externalContext = JSON.stringify({
      source: source === "webhook" ? "iiko_stoplist_webhook" : "iiko_stoplist_sync",
      branch_id: branchId || null,
      synced_at: new Date().toISOString(),
    });

    for (const externalId of unmatchedExternalIds) {
      await db.query(
        `INSERT INTO integration_mapping_candidates
           (provider, module, entity_type, local_entity_type, local_entity_id, local_name,
            external_entity_id, external_context, external_payload, confidence, state, notes)
         SELECT 'iiko', 'stoplist', 'stoplist_entity', 'unknown', NULL, NULL,
                ?, ?, NULL, NULL, 'requires_review', 'ID из стоп-листа iiko не найден среди локальных сопоставлений'
         WHERE NOT EXISTS (
           SELECT 1
           FROM integration_mapping_candidates c
           WHERE c.provider = 'iiko'
             AND c.module = 'stoplist'
             AND c.external_entity_id = ?
             AND c.state IN ('suggested', 'requires_review')
         )`,
        [externalId, externalContext, externalId],
      );
    }
  }

  if (matchedCount > 0) {
    const matchedIds = [...allExternalIdsSet].filter((externalId) => {
      const itemId = itemIdMap.get(externalId);
      const variantId = variantIdMap.get(externalId);
      const modifierId = modifierIdMap.get(externalId);
      return Number.isFinite(itemId) || Number.isFinite(variantId) || Number.isFinite(modifierId);
    });

    if (matchedIds.length > 0) {
      const placeholders = matchedIds.map(() => "?").join(",");
      await db.query(
        `UPDATE integration_mapping_candidates
         SET state = 'confirmed', resolved_at = NOW(), updated_at = NOW()
         WHERE provider = 'iiko'
           AND module = 'stoplist'
           AND external_entity_id IN (${placeholders})
           AND state IN ('suggested', 'requires_review')`,
        matchedIds,
      );
    }
  }

  const [[stopListTotalRows], [menuReadinessRows]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
       FROM menu_stop_list
       WHERE created_by IS NULL
         AND reason = ?`,
      [IIKO_STOPLIST_SYNC_REASON],
    ),
    db.query(
      `SELECT status
       FROM integration_readiness
       WHERE provider = 'iiko' AND module = 'menu'
       LIMIT 1`,
    ),
  ]);

  const stopListTotal = Number(stopListTotalRows?.[0]?.total || 0);
  const unmatchedCount = unmatchedExternalIds.size;
  const stopListStatus = menuReadinessRows?.[0]?.status === "ready" && unmatchedCount === 0 ? "ready" : "needs_mapping";
  const stopListStats = {
    synced_entries: stopListTotal,
    unmatched_candidates: unmatchedCount,
    linked: Math.max(stopListTotal - unmatchedCount, 0),
    unlinked: unmatchedCount,
  };

  await db.query(
    `INSERT INTO integration_readiness
       (provider, module, status, total_count, linked_count, unlinked_count, stats, policy, last_checked_at)
     VALUES
       ('iiko', 'stoplist', ?, ?, ?, ?, ?, JSON_OBJECT(), NOW())
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       total_count = VALUES(total_count),
       linked_count = VALUES(linked_count),
       unlinked_count = VALUES(unlinked_count),
       stats = VALUES(stats),
       last_checked_at = NOW()`,
    [stopListStatus, stopListTotal, Math.max(stopListTotal - unmatchedCount, 0), unmatchedCount, JSON.stringify(stopListStats)],
  );

  await invalidatePublicMenuCache();
  notifyMenuUpdated({
    source: source === "webhook" ? "iiko-stoplist-webhook" : "iiko-stoplist-sync",
    scope: targetBranchIds.length === 1 ? "branch" : "all",
    branchId: targetBranchIds.length === 1 ? targetBranchIds[0] : null,
  });

  await logIntegrationEvent({
    integrationType: INTEGRATION_TYPE.IIKO,
    module: INTEGRATION_MODULE.STOPLIST,
    action: source === "webhook" ? "apply_stoplist_webhook" : "sync_stoplist",
    status: "success",
    requestData: { reason, branchId, source },
    responseData: {
      hasData: Boolean(data),
      keys: data ? Object.keys(data).slice(0, 20) : [],
      targetBranches: targetBranchIds.length,
      removedCount,
      matchedCount,
      unmatchedCount,
      updatedCount,
    },
    durationMs: Date.now() - startedAt,
  });

  return {
    rawData: data,
    targetBranchIds,
    removedCount,
    matchedCount,
    unmatchedCount,
    updatedCount,
  };
}

export async function processIikoStopListSync(reason = "manual", branchId = null) {
  const client = await getIikoClientOrNull();
  if (!client) throw new Error("Клиент iiko недоступен");

  const { targetBranches } = await loadTargetBranches(branchId);
  const terminalGroupsIds = targetBranches.map((row) => row.terminalGroupId).filter(Boolean);
  const data = await client.getStopList({
    ...(terminalGroupsIds.length > 0 ? { terminalGroupsIds } : {}),
  });

  const result = await applyIikoStopListPayloadSync(data, { reason, branchId, source: "sync" });
  return result.rawData;
}

export async function processIikoStopListWebhookPayloadSync(payload = {}, branchId = null) {
  return applyIikoStopListPayloadSync(payload, {
    reason: "webhook",
    branchId,
    source: "webhook",
  });
}
