export { mainSituCli, runSituCli } from "./base.js";
export type {
  MainSituCliInput,
  RunSituCliInput,
  SituCliErrorOutput,
  SituCliInvocation,
  SituCliOutputMode,
  SituCliResult,
} from "./types.js";
export { defaultSituVersion } from "./types.js";

import { mainSituCli } from "./base.js";

if (import.meta.main) {
  process.exitCode = await mainSituCli();
}
