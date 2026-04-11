import { tenantRegistryRepository } from "./tenant-registry.repository.js";
import {
  getTenantStatusCode,
  isTenantStatusBlocked,
  normalizeTenantStatus,
} from "./tenant-status.service.js";

export const platformCoreTenantService = {
  async getBySlug(slug) {
    const tenant = await tenantRegistryRepository.getBySlug(slug);
    if (!tenant) return null;

    return {
      ...tenant,
      status: normalizeTenantStatus(tenant.status),
    };
  },

  isBlockedStatus(status) {
    return isTenantStatusBlocked(status);
  },

  getBlockedStatusCode(status) {
    return getTenantStatusCode(status);
  },
};
