import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

// Проверка наличия ключа шифрования
if (!process.env.ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY must be set in environment variables");
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Генерация ключа из мастер-ключа с использованием соли
function deriveKey(salt) {
  return crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, "sha256");
}

/**
 * Шифрование данных с использованием AES-256-GCM
 */
export function encrypt(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Формат: salt:iv:authTag:encrypted
    return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error.message);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Дешифрование данных
 */
export function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== "string") {
    return null;
  }

  try {
    const parts = encryptedData.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted data format");
    }

    const salt = Buffer.from(parts[0], "hex");
    const iv = Buffer.from(parts[1], "hex");
    const authTag = Buffer.from(parts[2], "hex");
    const encrypted = parts[3];

    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Шифрование email
 */
export function encryptEmail(email) {
  if (!email) return null;
  return encrypt(email.toLowerCase().trim());
}

/**
 * Дешифрование email
 */
export function decryptEmail(encryptedEmail) {
  if (!encryptedEmail) return null;
  return decrypt(encryptedEmail);
}

/**
 * Шифрование телефона
 */
export function encryptPhone(phone) {
  if (!phone) return null;
  // Нормализация: удаление всех символов кроме цифр и +
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  return encrypt(normalizedPhone);
}

/**
 * Дешифрование телефона
 */
export function decryptPhone(encryptedPhone) {
  if (!encryptedPhone) return null;
  return decrypt(encryptedPhone);
}

/**
 * Шифрование адреса
 */
export function encryptAddress(address) {
  if (!address) return null;
  return encrypt(address.trim());
}

/**
 * Дешифрование адреса
 */
export function decryptAddress(encryptedAddress) {
  if (!encryptedAddress) return null;
  return decrypt(encryptedAddress);
}

/**
 * Массовое дешифрование объекта
 */
export function decryptUserData(user) {
  if (!user) return null;

  const decrypted = { ...user };

  if (user.email) {
    try {
      decrypted.email = decryptEmail(user.email);
    } catch (error) {
      decrypted.email = null;
    }
  }

  if (user.phone) {
    try {
      decrypted.phone = decryptPhone(user.phone);
    } catch (error) {
      decrypted.phone = null;
    }
  }

  return decrypted;
}

/**
 * Массовое дешифрование адреса
 */
export function decryptAddressData(address) {
  if (!address) return null;

  const decrypted = { ...address };

  if (address.street_address) {
    try {
      decrypted.street_address = decryptAddress(address.street_address);
    } catch (error) {
      decrypted.street_address = null;
    }
  }

  if (address.full_address) {
    try {
      decrypted.full_address = decryptAddress(address.full_address);
    } catch (error) {
      decrypted.full_address = null;
    }
  }

  return decrypted;
}
