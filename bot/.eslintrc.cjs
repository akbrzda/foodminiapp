module.exports = {
  root: true,
  env: {
    node: true,
    es2023: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  ignorePatterns: ["node_modules/", "logs/"],
  extends: ["eslint:recommended"],
  rules: {
    "no-console": "off",
    "no-empty": "off",
    "no-unused-vars": "off",
  },
};
