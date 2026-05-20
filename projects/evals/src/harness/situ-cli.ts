import { mainSituCli } from "@situ/app";

const exitCode = await mainSituCli();

process.exit(exitCode);
