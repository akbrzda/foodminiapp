import db from "../../../config/database.js";

const NPS_COMMENT_MAX_LENGTH = 1000;

const addOneMonth = (value) => {
  const source = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(source.getTime())) return null;
  source.setMonth(source.getMonth() + 1);
  return source;
};

const toMonthStart = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

export const getUserLastNpsSubmission = async (userId) => {
  const [rows] = await db.query(
    `SELECT id, score, comment, submitted_at
     FROM monthly_nps_surveys
     WHERE user_id = ?
       AND score IS NOT NULL
       AND submitted_at IS NOT NULL
     ORDER BY submitted_at DESC, id DESC
     LIMIT 1`,
    [userId],
  );

  return rows[0] || null;
};

export const hasCompletedOrders = async (userId) => {
  const [rows] = await db.query(
    `SELECT 1
     FROM orders
     WHERE user_id = ?
       AND status = 'completed'
     LIMIT 1`,
    [userId],
  );

  return rows.length > 0;
};

export const getUserNpsStatus = async (userId, { requireCompletedOrder = true } = {}) => {
  if (!userId) {
    return {
      should_show: false,
      reason: "invalid_user",
      next_available_at: null,
      last_submitted_at: null,
      last_score: null,
      last_comment: null,
    };
  }

  if (requireCompletedOrder) {
    const eligibleByOrders = await hasCompletedOrders(userId);
    if (!eligibleByOrders) {
      return {
        should_show: false,
        reason: "no_completed_orders",
        next_available_at: null,
        last_submitted_at: null,
        last_score: null,
        last_comment: null,
      };
    }
  }

  const lastSubmission = await getUserLastNpsSubmission(userId);
  if (!lastSubmission) {
    return {
      should_show: true,
      reason: "first_time",
      next_available_at: null,
      last_submitted_at: null,
      last_score: null,
      last_comment: null,
    };
  }

  const lastSubmittedAt = new Date(lastSubmission.submitted_at);
  const nextAvailableAt = addOneMonth(lastSubmittedAt);
  const now = new Date();
  const shouldShow = Boolean(nextAvailableAt) && now.getTime() >= nextAvailableAt.getTime();

  return {
    should_show: shouldShow,
    reason: shouldShow ? "available" : "cooldown",
    next_available_at: nextAvailableAt ? nextAvailableAt.toISOString() : null,
    last_submitted_at: Number.isNaN(lastSubmittedAt.getTime()) ? null : lastSubmittedAt.toISOString(),
    last_score: Number(lastSubmission.score),
    last_comment: lastSubmission.comment || null,
  };
};

export const validateNpsPayload = ({ score, comment }) => {
  const numericScore = Number(score);
  if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 10) {
    return { valid: false, error: "Оценка NPS должна быть числом от 0 до 10" };
  }

  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    return { valid: false, error: "Комментарий должен быть строкой" };
  }

  const normalizedComment = typeof comment === "string" ? comment.trim() : "";
  if (normalizedComment.length > NPS_COMMENT_MAX_LENGTH) {
    return { valid: false, error: `Комментарий NPS не должен превышать ${NPS_COMMENT_MAX_LENGTH} символов` };
  }

  return {
    valid: true,
    score: numericScore,
    comment: normalizedComment || null,
  };
};

export const createNpsSubmission = async ({ userId, score, comment }) => {
  const surveyMonth = toMonthStart(new Date());

  await db.query(
    `INSERT INTO monthly_nps_surveys (user_id, survey_month, score, comment, submitted_at, notified_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [userId, surveyMonth, score, comment || null],
  );

  return {
    survey_month: surveyMonth,
    score,
    comment: comment || null,
  };
};

export default {
  getUserLastNpsSubmission,
  hasCompletedOrders,
  getUserNpsStatus,
  validateNpsPayload,
  createNpsSubmission,
};
