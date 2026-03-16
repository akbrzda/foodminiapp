import db from "../config/database.js";
import redis from "../config/redis.js";
import { answerCallbackQuery, requestTelegram, sendPhotoMessage, sendTextMessage } from "./telegramApi.js";
import { logger } from "../utils/logger.js";

const CHECK_SUB_RATE_LIMIT_SECONDS = 10;
const DEFAULT_ALREADY_SUBSCRIBED_MESSAGE = "Вы уже подписаны на канал. Нажмите кнопку проверки, если хотите получить награду.";

const isUserSubscribed = (chatMember) => {
  const status = String(chatMember?.status || "").toLowerCase();
  if (["member", "administrator", "creator"].includes(status)) return true;
  if (status === "restricted") return chatMember?.is_member === true;
  return false;
};

const buildSubscriptionKeyboard = (campaignId, channelUrl) => ({
  inline_keyboard: [
    [{ text: "📢 Подписаться на канал", url: channelUrl }],
    [{ text: "✅ Я подписался", callback_data: `check_sub:${campaignId}` }],
  ],
});

const resolveCampaignByTag = async (tag) => {
  const [rows] = await db.query(
    `SELECT id, tag, title, channel_id, channel_url, welcome_message, success_message, already_subscribed_message, error_message,
            media_type, media_url, is_reward_unique, is_active, is_perpetual, start_date, end_date
     FROM subscription_campaigns
     WHERE tag = ? AND is_active = 1
       AND (
         is_perpetual = 1
         OR (
           (start_date IS NULL OR start_date <= NOW())
           AND (end_date IS NULL OR end_date >= NOW())
         )
       )
     LIMIT 1`,
    [tag],
  );
  return rows[0] || null;
};

const resolveCampaignById = async (campaignId) => {
  const [rows] = await db.query(
    `SELECT id, tag, title, channel_id, channel_url, welcome_message, success_message, already_subscribed_message, error_message,
            media_type, media_url, is_reward_unique, is_active, is_perpetual, start_date, end_date
     FROM subscription_campaigns
     WHERE id = ? AND is_active = 1
     LIMIT 1`,
    [campaignId],
  );
  return rows[0] || null;
};

export const upsertBotUser = async (telegramUser) => {
  const telegramId = Number(telegramUser?.id);
  if (!Number.isFinite(telegramId) || telegramId <= 0) return null;
  const firstName = telegramUser?.first_name || null;
  const lastName = telegramUser?.last_name || null;

  const [existingRows] = await db.query(
    `SELECT id, registration_type
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    [telegramId],
  );

  if (existingRows.length > 0) {
    const existing = existingRows[0];
    const updates = [];
    const params = [];
    if (firstName) {
      updates.push("first_name = ?");
      params.push(firstName);
    }
    if (lastName) {
      updates.push("last_name = ?");
      params.push(lastName);
    }
    if (existing.registration_type !== "miniapp") {
      updates.push("registration_type = 'bot_only'");
    }
    updates.push("bot_registered_at = COALESCE(bot_registered_at, NOW())");
    if (updates.length) {
      params.push(existing.id);
      await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
    }
    return existing.id;
  }

  const [result] = await db.query(
    `INSERT INTO users (telegram_id, registration_type, bot_registered_at, phone, first_name, last_name)
     VALUES (?, 'bot_only', NOW(), NULL, ?, ?)`,
    [telegramId, firstName, lastName],
  );
  await db.query("UPDATE users SET current_loyalty_level_id = 1, loyalty_joined_at = NOW() WHERE id = ?", [result.insertId]);
  return result.insertId;
};

const upsertAttempt = async ({ campaignId, userId, telegramId }) => {
  await db.query(
    `INSERT INTO subscription_attempts (campaign_id, user_id, telegram_id, first_click_at, attempts_count, is_currently_subscribed)
     VALUES (?, ?, ?, NOW(), 1, 0)
     ON DUPLICATE KEY UPDATE
       telegram_id = VALUES(telegram_id),
       updated_at = CURRENT_TIMESTAMP`,
    [campaignId, userId, telegramId],
  );
};

const getAttempt = async ({ campaignId, userId }) => {
  const [rows] = await db.query(
    `SELECT id, campaign_id, user_id, telegram_id, attempts_count, rewards_claimed_count,
            first_click_at, last_check_at, first_subscribed_at, last_reward_claimed_at, is_currently_subscribed
     FROM subscription_attempts
     WHERE campaign_id = ? AND user_id = ?
     LIMIT 1`,
    [campaignId, userId],
  );
  return rows[0] || null;
};

const checkSubscription = async ({ channelId, telegramId }) => {
  try {
    const chatMember = await requestTelegram("getChatMember", {
      chat_id: channelId,
      user_id: telegramId,
    });
    return isUserSubscribed(chatMember);
  } catch (error) {
    logger.warn("Не удалось проверить подписку пользователя", {
      channelId,
      telegramId,
      error: error?.message || String(error),
    });
    return false;
  }
};

const markCheckAttempt = async ({ attemptId }) => {
  await db.query(
    `UPDATE subscription_attempts
     SET last_check_at = NOW(),
         attempts_count = attempts_count + 1
     WHERE id = ?`,
    [attemptId],
  );
};

const markSubscribed = async ({ attemptId }) => {
  await db.query(
    `UPDATE subscription_attempts
     SET is_currently_subscribed = 1,
         first_subscribed_at = COALESCE(first_subscribed_at, NOW())
     WHERE id = ?`,
    [attemptId],
  );
};

const markNotSubscribed = async ({ attemptId }) => {
  await db.query(
    `UPDATE subscription_attempts
     SET is_currently_subscribed = 0
     WHERE id = ?`,
    [attemptId],
  );
};

const markRewardClaimed = async ({ attemptId }) => {
  await db.query(
    `UPDATE subscription_attempts
     SET rewards_claimed_count = rewards_claimed_count + 1,
         last_reward_claimed_at = NOW()
     WHERE id = ?`,
    [attemptId],
  );
};

const sendSuccessPayload = async ({ chatId, campaign }) => {
  const text = String(campaign?.success_message || "Подписка подтверждена!").trim();
  const mediaType = String(campaign?.media_type || "").toLowerCase();
  const mediaUrl = String(campaign?.media_url || "").trim();
  if (mediaType === "photo" && mediaUrl) {
    await sendPhotoMessage({
      chatId,
      photo: mediaUrl,
      caption: text,
      parseMode: "HTML",
    });
    return;
  }
  await sendTextMessage({
    chatId,
    text,
    parseMode: "HTML",
  });
};

const processReward = async ({ campaign, attempt, chatId }) => {
  const rewardUnique = Number(campaign?.is_reward_unique || 0) === 1;
  const rewardsClaimed = Number(attempt?.rewards_claimed_count || 0);

  if (rewardUnique && rewardsClaimed > 0) {
    await sendTextMessage({
      chatId,
      text: "Вы уже получали награду по этой кампании.",
      parseMode: "HTML",
    });
    return { rewarded: false, repeated: true };
  }

  await sendSuccessPayload({ chatId, campaign });
  await markRewardClaimed({ attemptId: attempt.id });
  return { rewarded: true, repeated: false };
};

const buildRateLimitKey = ({ campaignId, userId }) => `subscription:check_sub:${campaignId}:${userId}`;

const canCheckSubscriptionNow = async ({ campaignId, userId }) => {
  const key = buildRateLimitKey({ campaignId, userId });
  const result = await redis.set(key, "1", "EX", CHECK_SUB_RATE_LIMIT_SECONDS, "NX");
  return result === "OK";
};

export const handleStartWithSubscriptionTag = async ({ chatId, telegramUser, tag }) => {
  const campaignTag = String(tag || "").trim();
  if (!campaignTag) return { handled: false };

  const campaign = await resolveCampaignByTag(campaignTag);
  if (!campaign) {
    await sendTextMessage({
      chatId,
      text: "Кампания не найдена или уже неактивна.",
      parseMode: "HTML",
    });
    return { handled: true };
  }

  const telegramId = Number(telegramUser?.id);
  const userId = await upsertBotUser(telegramUser);
  await upsertAttempt({ campaignId: campaign.id, userId, telegramId });

  const subscribed = await checkSubscription({
    channelId: campaign.channel_id,
    telegramId,
  });
  const attempt = await getAttempt({ campaignId: campaign.id, userId });

  if (subscribed && attempt) {
    await markSubscribed({ attemptId: attempt.id });
    await sendTextMessage({
      chatId,
      text: String(campaign.already_subscribed_message || DEFAULT_ALREADY_SUBSCRIBED_MESSAGE),
      parseMode: "HTML",
    });
    return { handled: true };
  }

  const keyboard = buildSubscriptionKeyboard(campaign.id, campaign.channel_url);
  await sendTextMessage({
    chatId,
    text: String(campaign.welcome_message || "Подпишитесь на канал и подтвердите подписку."),
    parseMode: "HTML",
    replyMarkup: keyboard,
  });
  return { handled: true };
};

export const handleCheckSubscriptionCallback = async ({ callbackQuery }) => {
  const safeAnswerCallback = async (payload, context) => {
    try {
      await answerCallbackQuery(payload);
    } catch (error) {
      logger.warn("Не удалось отправить answerCallbackQuery", {
        context,
        error: error?.message || String(error),
      });
    }
  };

  const callbackData = String(callbackQuery?.data || "");
  if (!callbackData.startsWith("check_sub:")) return { handled: false };

  const campaignId = Number(callbackData.split(":")[1]);
  const telegramId = Number(callbackQuery?.from?.id);
  const chatId = Number(callbackQuery?.message?.chat?.id || telegramId);
  if (!Number.isFinite(campaignId) || campaignId <= 0 || !Number.isFinite(telegramId) || telegramId <= 0) {
    if (callbackQuery?.id) {
      await safeAnswerCallback(
        {
          callbackQueryId: callbackQuery.id,
          text: "Некорректные данные кампании",
          showAlert: true,
        },
        "invalid_campaign_or_telegram_id",
      );
    }
    return { handled: true };
  }

  const campaign = await resolveCampaignById(campaignId);
  if (!campaign) {
    if (callbackQuery?.id) {
      await safeAnswerCallback(
        {
          callbackQueryId: callbackQuery.id,
          text: "Кампания завершена или недоступна",
          showAlert: true,
        },
        "campaign_not_found",
      );
    }
    return { handled: true };
  }

  const userId = await upsertBotUser(callbackQuery?.from);
  await upsertAttempt({ campaignId, userId, telegramId });
  const attempt = await getAttempt({ campaignId, userId });
  if (!attempt) {
    return { handled: true };
  }

  const canCheck = await canCheckSubscriptionNow({ campaignId, userId: attempt.user_id });
  if (!canCheck) {
    if (callbackQuery?.id) {
      await safeAnswerCallback(
        {
          callbackQueryId: callbackQuery.id,
          text: "Подождите 10 секунд перед повторной проверкой",
          showAlert: true,
        },
        "rate_limit",
      );
    }
    return { handled: true };
  }

  await markCheckAttempt({ attemptId: attempt.id });
  const subscribed = await checkSubscription({
    channelId: campaign.channel_id,
    telegramId,
  });

  if (!subscribed) {
    await markNotSubscribed({ attemptId: attempt.id });
    if (callbackQuery?.id) {
      await safeAnswerCallback(
        {
          callbackQueryId: callbackQuery.id,
          text: "Вы еще не подписались на канал",
          showAlert: true,
        },
        "not_subscribed",
      );
    }
    await sendTextMessage({
      chatId,
      text: String(campaign.error_message || "Подписка не обнаружена. Подпишитесь и повторите проверку."),
      parseMode: "HTML",
      replyMarkup: buildSubscriptionKeyboard(campaign.id, campaign.channel_url),
    });
    return { handled: true };
  }

  await markSubscribed({ attemptId: attempt.id });
  const updatedAttempt = await getAttempt({ campaignId, userId });
  await processReward({ campaign, attempt: updatedAttempt, chatId });
  if (callbackQuery?.id) {
    await safeAnswerCallback(
      {
        callbackQueryId: callbackQuery.id,
        text: "Подписка подтверждена",
        showAlert: false,
      },
      "subscription_confirmed",
    );
  }
  return { handled: true };
};

export default {
  upsertBotUser,
  handleStartWithSubscriptionTag,
  handleCheckSubscriptionCallback,
};
