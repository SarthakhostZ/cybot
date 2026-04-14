/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",

  // Collect coverage from all src files
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
  ],

  coverageReporters: ["text", "lcov", "html"],
  coverageThreshold: {
    global: { lines: 50, functions: 50 },
  },

  // Module name mapper for @/* path alias
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Transform all JS/TS in src
  transformIgnorePatterns: [
    "node_modules/(?!(jest-expo|expo|@expo|@unimodules|react-native|@react-native|@react-navigation|@supabase|supabase)/)",
  ],

  setupFilesAfterFramework: ["@testing-library/jest-native/extend-expect"],
  setupFiles: ["./jest.setup.js"],

  roots: ["<rootDir>/src/__tests__"],
};
