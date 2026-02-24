import db from "../../../config/database.js";
import { getIntegrationSettings, getIikoClientOrNull } from "../services/integrationConfigService.js";
import { enqueueIikoMenuSync, enqueueIikoStopListSync } from "../../../queues/config.js";

export class MenuAdapter {
  async getMode() {
    const settings = await getIntegrationSettings();
    const menuMode = String(settings?.integrationMode?.menu || "local")
      .trim()
      .toLowerCase();
    if (settings.iikoEnabled && menuMode === "external") return "iiko";
    return "local";
  }

  async triggerFullSync({ reason = "manual", cityId = null } = {}) {
    const settings = await getIntegrationSettings();
    const menuMode = String(settings?.integrationMode?.menu || "local")
      .trim()
      .toLowerCase();
    const mode = settings.iikoEnabled && menuMode === "external" ? "iiko" : "local";
    if (mode !== "iiko") {
      return { accepted: false, reason: "Синхронизация меню доступна только при iiko_enabled=true и integration_mode.menu=external" };
    }

    const job = await enqueueIikoMenuSync({ reason, cityId });
    return { accepted: true, jobId: job.id };
  }

  async triggerStopListSync({ reason = "manual", branchId = null } = {}) {
    const settings = await getIntegrationSettings();
    const menuMode = String(settings?.integrationMode?.menu || "local")
      .trim()
      .toLowerCase();
    const mode = settings.iikoEnabled && menuMode === "external" ? "iiko" : "local";
    if (mode !== "iiko") {
      return { accepted: false, reason: "Синхронизация стоп-листа доступна только при iiko_enabled=true и integration_mode.menu=external" };
    }

    const job = await enqueueIikoStopListSync({ reason, branchId });
    return { accepted: true, jobId: job.id };
  }

  async fetchExternalNomenclature() {
    const client = await getIikoClientOrNull();
    if (!client) {
      throw new Error("Клиент iiko недоступен");
    }
    const settings = await getIntegrationSettings();
    const externalMenuId = String(settings.iikoExternalMenuId || "").trim();
    if (!externalMenuId) {
      throw new Error("Не выбран iiko_external_menu_id");
    }

    return client.getMenuById({
      externalMenuId,
      priceCategoryId: String(settings.iikoPriceCategoryId || "").trim() || undefined,
      useConfiguredOrganization: false,
    });
  }

  async getSyncCounters() {
    const [orderRows] = await db.query(
      `SELECT
         SUM(CASE WHEN iiko_sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
         SUM(CASE WHEN iiko_sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN iiko_sync_status = 'error' THEN 1 ELSE 0 END) as error,
         SUM(CASE WHEN iiko_sync_status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM orders`,
    );

    return {
      orders: orderRows[0] || { synced: 0, pending: 0, error: 0, failed: 0 },
    };
  }
}

export default new MenuAdapter();
