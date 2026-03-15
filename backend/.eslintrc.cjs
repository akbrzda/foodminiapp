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
  ignorePatterns: ["node_modules/", "database/", "logs/"],
  extends: ["eslint:recommended"],
  rules: {
    "no-console": "off",
    "no-empty": "off",
    "no-unused-vars": "off",
    "no-unreachable": "off",
    "no-constant-condition": "off",
    "no-useless-catch": "off",
    "no-useless-escape": "off",
  },
};
