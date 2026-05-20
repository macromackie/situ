import { defineConfig } from "evalite/config";

export default defineConfig({
  maxConcurrency: 1,
  testTimeout: 30 * 60 * 1000,
  trialCount: 1,
});
