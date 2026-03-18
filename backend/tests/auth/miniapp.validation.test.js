import test from "node:test";
import assert from "node:assert/strict";
import { getMiniAppAuthDate, parseMiniAppUser, validateMiniAppInitData } from "../../src/utils/miniapp.js";

const BOT_TOKEN = "2Uk3Z_8zAlwhprgOcK3r1B1fDk8uhi2MDv47EvXkcu8";

const RAW_INIT_DATA =
  'auth_date=1733485316394&query_id=158b120b-7aa3-4a0f-a198-52ace06d0658&user={"language_code":"ru","first_name":"Вася","last_name":"","photo_url":null,"username":null,"id":400}&hash=f982406d90b118d8e90e26b33c5cec0cadd3fc30354f2955c75ff8e3d14d130d';

const ENCODED_INIT_DATA =
  "auth_date%3D1733485316394%26query_id%3D158b120b-7aa3-4a0f-a198-52ace06d0658%26user%3D%257B%2522language_code%2522%253A%2522ru%2522%252C%2522first_name%2522%253A%2522%25D0%2592%25D0%25B0%25D1%2581%25D1%258F%2522%252C%2522last_name%2522%253A%2522%2522%252C%2522photo_url%2522%253Anull%252C%2522username%2522%253Anull%252C%2522id%2522%253A400%257D%26hash%3Df982406d90b118d8e90e26b33c5cec0cadd3fc30354f2955c75ff8e3d14d130d";

test("miniapp.validation: validateMiniAppInitData поддерживает raw initData", () => {
  assert.equal(validateMiniAppInitData(RAW_INIT_DATA, BOT_TOKEN), true);
});

test("miniapp.validation: validateMiniAppInitData поддерживает URL-encoded initData", () => {
  assert.equal(validateMiniAppInitData(ENCODED_INIT_DATA, BOT_TOKEN), true);
});

test("miniapp.validation: parseMiniAppUser корректно извлекает user из encoded initData", () => {
  const parsed = parseMiniAppUser(ENCODED_INIT_DATA);

  assert.equal(parsed?.id, "400");
  assert.equal(parsed?.firstName, "Вася");
  assert.equal(parsed?.languageCode, "ru");
  assert.equal(getMiniAppAuthDate(ENCODED_INIT_DATA), 1733485316394);
});

