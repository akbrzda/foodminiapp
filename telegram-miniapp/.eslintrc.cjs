module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2023: true,
  },
  parser: "vue-eslint-parser",
  parserOptions: {
    parser: "espree",
    ecmaVersion: "latest",
    sourceType: "module",
  },
  ignorePatterns: ["node_modules/", "dist/"],
  extends: ["eslint:recommended", "plugin:vue/vue3-essential"],
  rules: {
    "no-console": "off",
    "no-empty": "off",
    "no-unused-vars": "off",
    "no-useless-escape": "off",
    "vue/multi-word-component-names": "off",
    "vue/no-use-v-if-with-v-for": "off",
  },
};
