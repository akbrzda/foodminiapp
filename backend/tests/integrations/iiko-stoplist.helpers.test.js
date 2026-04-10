import test from "node:test";
import assert from "node:assert/strict";
import { buildStopListEntryMap } from "../../src/modules/integrations/services/sync-processors/iiko-stoplist.helpers.js";

test("iiko-stoplist.helpers: извлекает позиции из batched webhook payload", () => {
  const payload = [
    {
      eventType: "StopListUpdate",
      eventInfo: {
        terminalGroupsStopListsUpdates: [
          {
            terminalGroupId: "tg-1",
            items: [
              {
                productId: "product-1",
                balance: 0,
                dateAdd: "2026-04-10T09:15:00Z",
              },
            ],
          },
        ],
      },
    },
  ];

  const { entryMap, allExternalIdsSet } = buildStopListEntryMap(
    payload,
    [{ id: 1, terminalGroupId: "tg-1" }],
    "Автосинк"
  );

  assert.equal(allExternalIdsSet.has("product-1"), true);
  assert.equal(entryMap.has("tg-1"), true);
  assert.equal(entryMap.get("tg-1").has("product-1"), true);
});

test("iiko-stoplist.helpers: извлекает позиции из eventInfo.stopLists", () => {
  const payload = {
    eventType: "StopListUpdate",
    eventInfo: {
      stopLists: [
        {
          items: [
            {
              productId: "product-2",
              balance: 0,
            },
          ],
        },
      ],
    },
  };

  const { entryMap, allExternalIdsSet } = buildStopListEntryMap(
    payload,
    [{ id: 2, terminalGroupId: "tg-2" }],
    "Автосинк"
  );

  assert.equal(allExternalIdsSet.has("product-2"), true);
  assert.equal(entryMap.has(""), true);
  assert.equal(entryMap.get("").has("product-2"), true);
});
