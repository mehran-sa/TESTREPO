import globals from "globals";
export default [{
  files: ["**/*.js"],
  languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.browser, XLSX: "readonly" } },
  rules: {
    "no-unused-vars": ["warn", { args: "none" }],
    "no-undef": "error", "no-redeclare": "error", "no-dupe-keys": "error",
    "no-fallthrough": "error", "no-self-assign": "error",
    "no-empty": ["warn", { allowEmptyCatch: true }], "no-constant-condition": "warn"
  }
}];
