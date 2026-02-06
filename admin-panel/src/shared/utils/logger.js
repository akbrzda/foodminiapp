/**
 * Утилиты для безопасного логирования в режиме разработки
 */

const isDev = import.meta.env.DEV;

/**
 * Логирование в режиме разработки
 * @param  {...any} args - Аргументы для console.log
 */
export const devLog = (...args) => {
  if (isDev) {
    console.log(...args);
  }
};

/**
 * Логирование ошибок
 * @param  {...any} args - Аргументы для console.error
 */
export const devError = (...args) => {
  if (isDev) {
    console.error(...args);
  }
  // В production можно отправлять в Sentry или другой сервис
};

/**
 * Логирование предупреждений
 * @param  {...any} args - Аргументы для console.warn
 */
export const devWarn = (...args) => {
  if (isDev) {
    console.warn(...args);
  }
};

/**
 * Логирование отладочной информации
 * @param  {...any} args - Аргументы для console.debug
 */
export const devDebug = (...args) => {
  if (isDev) {
    console.debug(...args);
  }
};
