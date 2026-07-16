import eslint from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            ".choir/**",
            ".venv-docs/**",
            "core/**",
            "coverage/**",
            "cubism/**",
            "dist/**",
            "site/**",
            "test.build/**",
            "types/**",
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{cjs,js,mjs,ts}"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            "@typescript-eslint/consistent-type-imports": [
                "warn",
                { disallowTypeAnnotations: false },
            ],
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-expressions": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/require-await": "off",
            "no-unused-vars": "off",
        },
    },
    eslintPluginPrettierRecommended,
    {
        files: ["test/**/*.{js,ts}"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
);
