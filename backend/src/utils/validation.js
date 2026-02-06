/**
 * Валидация email адреса
 */
export function validateEmail(email) {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email is required" };
  }

  const trimmedEmail = email.trim();

  if (trimmedEmail.length === 0) {
    return { valid: false, error: "Email cannot be empty" };
  }

  if (trimmedEmail.length > 255) {
    return { valid: false, error: "Email is too long (max 255 characters)" };
  }

  // RFC 5322 совместимый regex (упрощенная версия)
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, error: "Invalid email format" };
  }

  // Проверка на опасные символы
  const dangerousChars = /[<>'"`;\\]/;
  if (dangerousChars.test(trimmedEmail)) {
    return { valid: false, error: "Email contains invalid characters" };
  }

  return { valid: true, email: trimmedEmail.toLowerCase() };
}

/**
 * Валидация номера телефона
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== "string") {
    return { valid: false, error: "Phone is required" };
  }

  const trimmedPhone = phone.trim();

  if (trimmedPhone.length === 0) {
    return { valid: false, error: "Phone cannot be empty" };
  }

  // Удаление всех символов кроме цифр и +
  const normalizedPhone = trimmedPhone.replace(/[^\d+]/g, "");

  // Минимум 10 цифр (локальные номера) или +7XXXXXXXXXX (международный формат)
  if (normalizedPhone.length < 10) {
    return { valid: false, error: "Phone number is too short (minimum 10 digits)" };
  }

  if (normalizedPhone.length > 15) {
    return { valid: false, error: "Phone number is too long (maximum 15 digits)" };
  }

  // Международный формат должен начинаться с +
  if (normalizedPhone.includes("+") && !normalizedPhone.startsWith("+")) {
    return { valid: false, error: "International format must start with +" };
  }

  // Проверка на валидный формат (только цифры после +)
  const phoneRegex = /^\+?\d{10,15}$/;
  if (!phoneRegex.test(normalizedPhone)) {
    return { valid: false, error: "Invalid phone format" };
  }

  return { valid: true, phone: normalizedPhone };
}

/**
 * Валидация адреса
 */
export function validateAddress(address) {
  if (!address || typeof address !== "string") {
    return { valid: false, error: "Address is required" };
  }

  const trimmedAddress = address.trim();

  if (trimmedAddress.length === 0) {
    return { valid: false, error: "Address cannot be empty" };
  }

  if (trimmedAddress.length < 5) {
    return { valid: false, error: "Address is too short (minimum 5 characters)" };
  }

  if (trimmedAddress.length > 500) {
    return { valid: false, error: "Address is too long (maximum 500 characters)" };
  }

  // Проверка на опасные символы для SQL/XSS
  const dangerousChars = /[<>'"`;\\]/;
  if (dangerousChars.test(trimmedAddress)) {
    return { valid: false, error: "Address contains invalid characters" };
  }

  // Проверка на наличие хотя бы одной буквы или цифры
  if (!/[a-zA-Zа-яА-Я0-9]/.test(trimmedAddress)) {
    return { valid: false, error: "Address must contain at least one letter or digit" };
  }

  return { valid: true, address: trimmedAddress };
}

/**
 * Валидация имени пользователя
 */
export function validateName(name) {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Name is required" };
  }

  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    return { valid: false, error: "Name cannot be empty" };
  }

  if (trimmedName.length < 2) {
    return { valid: false, error: "Name is too short (minimum 2 characters)" };
  }

  if (trimmedName.length > 100) {
    return { valid: false, error: "Name is too long (maximum 100 characters)" };
  }

  // Разрешены буквы, пробелы, дефисы, апострофы
  const nameRegex = /^[a-zA-Zа-яА-ЯёЁ\s'-]+$/;
  if (!nameRegex.test(trimmedName)) {
    return { valid: false, error: "Name contains invalid characters" };
  }

  // Проверка на подозрительные паттерны
  if (/\s{2,}/.test(trimmedName)) {
    return { valid: false, error: "Name contains multiple consecutive spaces" };
  }

  if (/--/.test(trimmedName)) {
    return { valid: false, error: "Name contains multiple consecutive hyphens" };
  }

  return { valid: true, name: trimmedName };
}

/**
 * Валидация даты рождения
 */
export function validateBirthdate(birthdate) {
  if (!birthdate) {
    return { valid: true, birthdate: null }; // Опциональное поле
  }

  const date = new Date(birthdate);

  if (isNaN(date.getTime())) {
    return { valid: false, error: "Invalid date format" };
  }

  const now = new Date();
  const minAge = 10; // Минимальный возраст
  const maxAge = 120; // Максимальный возраст

  const minDate = new Date(now.getFullYear() - maxAge, now.getMonth(), now.getDate());
  const maxDate = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());

  if (date < minDate) {
    return { valid: false, error: `Age cannot be more than ${maxAge} years` };
  }

  if (date > maxDate) {
    return { valid: false, error: `User must be at least ${minAge} years old` };
  }

  if (date > now) {
    return { valid: false, error: "Birthdate cannot be in the future" };
  }

  return { valid: true, birthdate: date.toISOString().split("T")[0] };
}
