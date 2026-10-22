import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  { files: ["scripts/**"], rules: { "no-console": "off" } },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);
