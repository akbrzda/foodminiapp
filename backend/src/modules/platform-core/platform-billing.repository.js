import { getPlatformCorePool } from "../tenancy/platform-core.db.js";

export const platformBillingRepository = {
  async listTransactions(limit = 100) {
    const [rows] = await getPlatformCorePool().query(
      `SELECT id, tenant_id, subscription_id, amount, currency, status, provider, provider_txn_id, description, metadata, created_at, updated_at
       FROM billing_transactions
       ORDER BY id DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  },

  async getTransactionById(id) {
    const [rows] = await getPlatformCorePool().query(
      `SELECT id, tenant_id, subscription_id, amount, currency, status, provider, provider_txn_id, description, metadata, created_at, updated_at
       FROM billing_transactions
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async createTransaction(payload) {
    const [result] = await getPlatformCorePool().query(
      `INSERT INTO billing_transactions (
         tenant_id, subscription_id, amount, currency, status, provider, provider_txn_id, description, metadata
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.tenant_id,
        payload.subscription_id,
        payload.amount,
        payload.currency,
        payload.status,
        payload.provider,
        payload.provider_txn_id,
        payload.description,
        payload.metadata,
      ]
    );
    return this.getTransactionById(result.insertId);
  },

  async findBillingEvent(provider, providerEventId) {
    const [rows] = await getPlatformCorePool().query(
      `SELECT id, tenant_id, transaction_id, provider, event_type, provider_event_id, payload, received_at, processed_at, processing_status, processing_error
       FROM billing_events
       WHERE provider = ? AND provider_event_id = ?
       LIMIT 1`,
      [provider, providerEventId]
    );
    return rows[0] || null;
  },

  async createBillingEvent(payload) {
    const [result] = await getPlatformCorePool().query(
      `INSERT INTO billing_events (
         tenant_id, transaction_id, provider, event_type, provider_event_id, payload, processing_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.tenant_id,
        payload.transaction_id,
        payload.provider,
        payload.event_type,
        payload.provider_event_id,
        payload.payload,
        payload.processing_status,
      ]
    );
    const [rows] = await getPlatformCorePool().query(
      `SELECT id, tenant_id, transaction_id, provider, event_type, provider_event_id, payload, received_at, processed_at, processing_status, processing_error
       FROM billing_events
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );
    return rows[0] || null;
  },

  async markBillingEventProcessed(id, processingStatus, processingError = null) {
    await getPlatformCorePool().query(
      `UPDATE billing_events
       SET processing_status = ?, processing_error = ?, processed_at = NOW()
       WHERE id = ?`,
      [processingStatus, processingError, id]
    );
  },
};
