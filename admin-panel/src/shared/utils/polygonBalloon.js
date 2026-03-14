const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildStatusBadge = (isBlocked, isInactive) => {
  if (isBlocked) {
    return '<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(239,68,68,0.12);color:#b91c1c;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:1.1;">Заблокирован</span>';
  }
  if (isInactive) {
    return '<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(148,163,184,0.18);color:#475569;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:1.1;">Неактивен</span>';
  }
  return "";
};

export const buildPolygonBalloonContent = (polygon, options = {}) => {
  const {
    fallbackName = "Полигон",
    fallbackBranchName = "Филиал не указан",
    useTariffBasedLabels = true,
    isBlocked = false,
    isInactive = false,
  } = options;

  const polygonName = escapeHtml(polygon?.name || `${fallbackName} #${polygon?.id || ""}`);
  const branchName = escapeHtml(polygon?.branch_name || fallbackBranchName);
  const deliveryTime = toNumber(polygon?.delivery_time, 30);
  const tariffsCount = toNumber(polygon?.tariffs_count, 0);
  const minOrderAmount = toNumber(polygon?.min_order_amount, 0);
  const deliveryCost = toNumber(polygon?.delivery_cost, 0);
  const minOrderLabel = useTariffBasedLabels && tariffsCount > 0 ? "по тарифам" : `${minOrderAmount} ₽`;
  const deliveryCostLabel = useTariffBasedLabels && tariffsCount > 0 ? "по тарифам" : `${deliveryCost} ₽`;
  const statusBadge = buildStatusBadge(isBlocked, isInactive);

  return `
    <div style="min-width:260px;max-width:320px;padding:2px 2px 0;font-family:Montserrat,Arial,sans-serif;">
      <div style="font-size:17px;font-weight:700;line-height:1.25;color:#111827;letter-spacing:-0.01em;">${polygonName}</div>
      <div style="margin-top:4px;font-size:12px;line-height:1.3;color:#6b7280;">${branchName}</div>
      <div style="margin-top:10px;display:grid;gap:6px;">
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;line-height:1.25;color:#4b5563;">
          <span style="color:#6b7280;">Время доставки</span>
          <span style="font-weight:600;color:#111827;">${deliveryTime} мин</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;line-height:1.25;color:#4b5563;">
          <span style="color:#6b7280;">Мин. заказ</span>
          <span style="font-weight:600;color:#111827;">${minOrderLabel}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;line-height:1.25;color:#4b5563;">
          <span style="color:#6b7280;">Доставка</span>
          <span style="font-weight:600;color:#111827;">${deliveryCostLabel}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;line-height:1.25;color:#4b5563;">
          <span style="color:#6b7280;">Тарифы</span>
          <span style="font-weight:600;color:#111827;">${tariffsCount} шт.</span>
        </div>
      </div>
      ${statusBadge ? `<div style="margin-top:10px;">${statusBadge}</div>` : ""}
    </div>
  `;
};
