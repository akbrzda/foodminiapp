export function buildStopListEntryMap(data, targetBranches, autoReason) {
  const resolveTerminalGroupId = (value = {}) =>
    String(
      value?.terminalGroupId || value?.terminal_group_id || value?.terminalGroup?.id || ""
    ).trim();

  const resolveEntityIds = (value = {}) => {
    const ids = new Set();
    const push = (raw) => {
      const normalized = String(raw || "").trim();
      if (normalized) ids.add(normalized);
    };

    push(value?.id);
    push(value?.itemId);
    push(value?.item_id);
    push(value?.productId);
    push(value?.product_id);
    push(value?.sizeId);
    push(value?.size_id);
    push(value?.variantId);
    push(value?.variant_id);
    push(value?.modifierId);
    push(value?.modifier_id);
    return [...ids];
  };

  const resolveContainerItems = (value = {}) => {
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.products)) return value.products;
    if (Array.isArray(value?.stopList)) return value.stopList;
    if (Array.isArray(value?.stop_list)) return value.stop_list;
    return [];
  };

  const resolveTopLevelContainers = (payload = {}) => {
    if (Array.isArray(payload?.terminalGroupStopLists)) return payload.terminalGroupStopLists;
    if (Array.isArray(payload?.terminalGroupsStopListsUpdates)) return payload.terminalGroupsStopListsUpdates;
    if (Array.isArray(payload?.stopLists)) return payload.stopLists;
    if (Array.isArray(payload?.organizationStopLists)) return payload.organizationStopLists;
    if (Array.isArray(payload?.eventInfo?.terminalGroupsStopListsUpdates)) return payload.eventInfo.terminalGroupsStopListsUpdates;
    return [];
  };

  const parseStopListCreatedAt = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const direct = raw
      .replace("T", " ")
      .replace(/Z$/, "")
      .replace(/\.\d+$/, "");
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(direct)) return direct;

    const parsedDate = new Date(raw);
    if (Number.isNaN(parsedDate.getTime())) return null;
    const yyyy = parsedDate.getFullYear();
    const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const dd = String(parsedDate.getDate()).padStart(2, "0");
    const hh = String(parsedDate.getHours()).padStart(2, "0");
    const mi = String(parsedDate.getMinutes()).padStart(2, "0");
    const ss = String(parsedDate.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  };

  const buildStopListMeta = (value = {}) => {
    const reasonCandidates = [
      value?.reason,
      value?.stopReason,
      value?.stop_reason,
      value?.cause,
      value?.comment,
      value?.description,
    ];
    const reasonValue = reasonCandidates.map((item) => String(item || "").trim()).find(Boolean);
    const balanceValue = Number(value?.balance);
    const fallbackReason =
      Number.isFinite(balanceValue) && balanceValue <= 0
        ? `Нет остатка в iiko (balance: ${balanceValue})`
        : autoReason;

    return {
      reason: reasonValue || fallbackReason,
      createdAt: parseStopListCreatedAt(
        value?.dateAdd ||
          value?.date_add ||
          value?.createdAt ||
          value?.created_at ||
          value?.stoppedAt
      ),
    };
  };

  const entryMap = new Map();

  const pushEntry = (terminalGroupIdRaw, item) => {
    const key = String(terminalGroupIdRaw || "").trim();
    const ids = resolveEntityIds(item);
    if (ids.length === 0) return;
    if (!entryMap.has(key)) entryMap.set(key, new Map());

    const stopMeta = buildStopListMeta(item);
    for (const externalId of ids) {
      const existing = entryMap.get(key).get(externalId) || null;
      if (!existing) {
        entryMap.get(key).set(externalId, stopMeta);
        continue;
      }

      const existingTs = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
      const nextTs = stopMeta.createdAt ? new Date(stopMeta.createdAt).getTime() : 0;
      const shouldReplaceCreatedAt = nextTs > existingTs;

      entryMap.get(key).set(externalId, {
        reason: stopMeta.reason || existing.reason || autoReason,
        createdAt: shouldReplaceCreatedAt ? stopMeta.createdAt : existing.createdAt,
      });
    }
  };

  const collectEntries = (node, inheritedTerminalGroupId = "") => {
    if (!node || typeof node !== "object") return;

    const ownTerminalGroupId = resolveTerminalGroupId(node);
    const terminalGroupId = ownTerminalGroupId || inheritedTerminalGroupId;
    pushEntry(terminalGroupId, node);

    const nestedItems = resolveContainerItems(node);
    if (nestedItems.length === 0) return;
    for (const nestedNode of nestedItems) {
      collectEntries(nestedNode, terminalGroupId);
    }
  };

  const topLevelContainers = resolveTopLevelContainers(data);
  if (topLevelContainers.length > 0) {
    for (const container of topLevelContainers) {
      collectEntries(container, "");
    }
  } else {
    const fallbackItems = resolveContainerItems(data);
    for (const item of fallbackItems) {
      collectEntries(item, "");
    }
  }

  const allExternalIdsSet = new Set();
  for (const [terminalGroupId, idsMap] of entryMap.entries()) {
    if (!terminalGroupId) {
      for (const id of idsMap.keys()) allExternalIdsSet.add(id);
      continue;
    }
    if (targetBranches.some((branch) => branch.terminalGroupId === terminalGroupId)) {
      for (const id of idsMap.keys()) allExternalIdsSet.add(id);
    }
  }

  return {
    entryMap,
    allExternalIdsSet,
  };
}

export async function resolveStopListEntityMaps(db, allExternalIds = []) {
  const itemIdMap = new Map();
  const variantIdMap = new Map();
  const modifierIdMap = new Map();

  if (allExternalIds.length === 0) {
    return { itemIdMap, variantIdMap, modifierIdMap };
  }

  const placeholders = allExternalIds.map(() => "?").join(",");
  const [[itemRows], [variantRows], [modifierRows]] = await Promise.all([
    db.query(`SELECT id, iiko_item_id FROM menu_items WHERE iiko_item_id IN (${placeholders})`, allExternalIds),
    db.query(`SELECT id, iiko_variant_id FROM item_variants WHERE iiko_variant_id IN (${placeholders})`, allExternalIds),
    db.query(`SELECT id, iiko_modifier_id FROM modifiers WHERE iiko_modifier_id IN (${placeholders})`, allExternalIds),
  ]);

  for (const row of itemRows) {
    itemIdMap.set(String(row.iiko_item_id).trim(), Number(row.id));
  }
  for (const row of variantRows) {
    variantIdMap.set(String(row.iiko_variant_id).trim(), Number(row.id));
  }
  for (const row of modifierRows) {
    modifierIdMap.set(String(row.iiko_modifier_id).trim(), Number(row.id));
  }

  return { itemIdMap, variantIdMap, modifierIdMap };
}
