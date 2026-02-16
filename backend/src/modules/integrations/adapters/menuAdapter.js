import db from "../../../config/database.js";
import { getIntegrationSettings, getIikoClientOrNull } from "../services/integrationConfigService.js";
import { enqueueIikoMenuSync } from "../../../queues/config.js";

export class MenuAdapter {
  async getMode() {
    const settings = await getIntegrationSettings();
    if (settings.iikoEnabled) return "iiko";
    return "local";
  }

  async triggerFullSync({ reason = "manual", cityId = null } = {}) {
    const mode = await this.getMode();
    if (mode !== "iiko") {
      return { accepted: false, reason: "Интеграция iiko отключена" };
    }

    const job = await enqueueIikoMenuSync({ reason, cityId });
    return { accepted: true, jobId: job.id };
  }

  async triggerStopListSync({ reason = "manual", branchId = null } = {}) {
    return { accepted: false, reason: "Синхронизация стоп-листа временно отключена. Доступен только ручной sync меню." };
  }

  async fetchExternalNomenclature() {
    const client = await getIikoClientOrNull();
    if (!client) {
      throw new Error("Клиент iiko недоступен");
    }
    return client.getNomenclature({ useConfiguredOrganization: false });
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
