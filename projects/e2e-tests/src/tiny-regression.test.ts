import { expect, test } from "bun:test";

import { runSituCli } from "@situ/app";
import { tinyAutoresearchFixture } from "@situ/fixtures";

import { createTinyRegressionE2eResult } from "./index.js";

test("tiny regression e2e test exercises app-facing CLI code", async () => {
  const versionResult = await runSituCli({
    args: ["--version"],
    version: "v0.0.0",
  });

  const doctorResult = await runSituCli({ args: ["doctor"] });

  const e2eResult = createTinyRegressionE2eResult({
    versionResult,
    doctorResult,
  });

  expect(e2eResult.fixture).toBe(tinyAutoresearchFixture);
  expect(e2eResult.versionResult.stdout).toBe("v0.0.0\n");
  expect(e2eResult.doctorResult.stdout).toBe("situ doctor ok\n");
  expect(tinyAutoresearchFixture.expectedAssertions).toContain(
    "situ doctor returns a successful health message",
  );
});
