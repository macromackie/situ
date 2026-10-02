import { homedir } from "node:os";
import { resolve } from "node:path";
export const stateDirectory = resolve(
  process.env.SITU_DATA_DIR ?? resolve(homedir(), ".local/share/situ"),
);
export const root = resolve(import.meta.dirname, "../../..");
export const baseUrl = process.env.SITU_URL ?? "http://127.0.0.1:4317";
