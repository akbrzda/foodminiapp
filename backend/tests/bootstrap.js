process.env.NODE_ENV = "test";
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_PORT = process.env.DB_PORT || "3306";
process.env.DB_NAME = process.env.DB_NAME || "test_db";
process.env.DB_USER = process.env.DB_USER || "test_user";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test_password";
process.env.REDIS_HOST = process.env.REDIS_HOST || "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key-test-encryption-key-test-encryption-key";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  "test-secret-test-secret-test-secret-test-secret-test-secret-test-secret-1234";
process.env.ADMIN_REFRESH_SESSION_HOURS = process.env.ADMIN_REFRESH_SESSION_HOURS || "12";
