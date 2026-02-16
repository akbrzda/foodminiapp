import { getIntegrationSettings } from "../services/integrationConfigService.js";
import { enqueueIikoOrderSync, enqueuePremiumBonusPurchaseSync } from "../../../queues/config.js";

export class OrdersAdapter {
  async isIikoEnabled() {
    const settings = await getIntegrationSettings();
    return settings.iikoEnabled && settings?.integrationMode?.orders === "external";
  }

  async isPremiumBonusEnabled() {
    const settings = await getIntegrationSettings();
    return settings.premiumbonusEnabled && settings?.integrationMode?.loyalty === "external";
  }

  async enqueueOrderSync(orderId, payload = {}) {
    const iikoEnabled = await this.isIikoEnabled();
    if (!iikoEnabled) return { skipped: true, reason: "iiko отключен" };
    const job = await enqueueIikoOrderSync({ orderId, ...payload });
    return { skipped: false, jobId: job.id };
  }

  async enqueuePurchaseSync(orderId, action = "create", payload = {}) {
    const pbEnabled = await this.isPremiumBonusEnabled();
    if (!pbEnabled) return { skipped: true, reason: "PremiumBonus отключен" };
    const job = await enqueuePremiumBonusPurchaseSync({ orderId, action, ...payload });
    return { skipped: false, jobId: job.id };
  }
}

export default new OrdersAdapter();
