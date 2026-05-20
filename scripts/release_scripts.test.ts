import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildScript = "config/scripts/build_release_assets.sh";
const installScript = "config/scripts/install.sh";

type ScriptResult = {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

const invalidVersions = [
  "",
  "v1x.2.3",
  "v1.2.3-beta",
  "v1.2.3+build",
  "refs/tags/v1.2.3",
  "not-a-version",
] as const;
const validArtifactVersions = ["v1.2.3", "0.0.0-dev"] as const;

describe("release script version validation", () => {
  for (const version of invalidVersions) {
    test(`build script rejects ${formatVersionName(version)}`, () => {
      const result = runScript(buildScript, {
        SITU_VERSION: version,
        SITU_PLATFORM: "unsupported-platform",
        SITU_TARGET: "unsupported-target",
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(expectedVersionError(version));
    });

    test(`install script rejects ${formatVersionName(version)}`, () => {
      const result = runScript(installScript, {
        SITU_VERSION: version,
        SITU_RELEASE_TARBALL: "/does/not/exist/situ.tar.gz",
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(expectedVersionError(version));
    });
  }

  for (const version of validArtifactVersions) {
    test(`build script passes version validation for ${version}`, () => {
      const result = runScript(buildScript, {
        SITU_VERSION: version,
        SITU_PLATFORM: "unsupported-platform",
        SITU_TARGET: "unsupported-target",
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Unsupported platform/target pair");
      expect(result.stderr).not.toContain("SITU_VERSION must be shaped");
    });

    test(`install script passes version validation for ${version}`, () => {
      const result = runScript(installScript, {
        SITU_VERSION: version,
        SITU_RELEASE_TARBALL: "/does/not/exist/situ.tar.gz",
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("SITU_RELEASE_TARBALL not found");
      expect(result.stderr).not.toContain("SITU_VERSION must be shaped");
    });
  }
});

describe("release installer", () => {
  test("requires an explicit version for local tarball installs", () => {
    const result = runScript(installScript, {
      SITU_RELEASE_TARBALL: "/does/not/exist/situ.tar.gz",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(
      "SITU_RELEASE_TARBALL requires SITU_VERSION or a version argument",
    );
  });

  test("accepts a positional version for local tarball installs", () => {
    const result = runScript(
      installScript,
      {
        SITU_RELEASE_TARBALL: "/does/not/exist/situ.tar.gz",
      },
      ["v1.2.3"],
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("SITU_RELEASE_TARBALL not found");
    expect(result.stderr).not.toContain("SITU_VERSION must be shaped");
  });

  test("runs without sibling helper files when piped from GitHub", () => {
    const tempRoot = mkTempRoot();

    try {
      const standaloneInstallScript = join(tempRoot, "install.sh");
      copyFileSync(resolve(repoRoot, installScript), standaloneInstallScript);
      chmodSync(standaloneInstallScript, 0o755);

      const result = runScript(
        standaloneInstallScript,
        {
          SITU_RELEASE_TARBALL: "/does/not/exist/situ.tar.gz",
        },
        ["v1.2.3"],
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("SITU_RELEASE_TARBALL not found");
      expect(result.stderr).not.toContain("release_version.sh");
      expect(result.stderr).not.toContain("SITU_VERSION must be shaped");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("installs a local archive into the versioned layout", () => {
    const tempRoot = mkTempRoot();

    try {
      const stageRoot = join(tempRoot, "stage");
      const tarballPath = join(tempRoot, "situ-v1.2.3-test.tar.gz");
      const installHome = join(tempRoot, "install");
      const binDir = join(tempRoot, "bin");

      mkdirSync(join(stageRoot, "bin"), { recursive: true });
      writeFileSync(join(stageRoot, "bin", "situ"), "#!/bin/sh\nprintf 'fake situ\\n'\n");
      chmodSync(join(stageRoot, "bin", "situ"), 0o755);
      writeFileSync(join(stageRoot, "README.md"), "# fake situ\n");
      writeFileSync(join(stageRoot, "MANIFEST"), "situ-version: v1.2.3\n");

      const tarResult = Bun.spawnSync({
        cmd: ["tar", "-czf", tarballPath, "-C", stageRoot, "bin", "README.md", "MANIFEST"],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(tarResult.exitCode).toBe(0);

      const result = runScript(installScript, {
        SITU_VERSION: "v1.2.3",
        SITU_RELEASE_TARBALL: tarballPath,
        SITU_INSTALL_HOME: installHome,
        SITU_BIN_DIR: binDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Situ v1.2.3 installed.");
      expect(existsSync(join(installHome, "versions", "v1.2.3", "bin", "situ"))).toBe(true);
      expect(lstatSync(join(installHome, "current")).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(installHome, "current"))).toBe("versions/v1.2.3");
      expect(lstatSync(join(binDir, "situ")).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(binDir, "situ"))).toBe(join(installHome, "current", "bin", "situ"));

      const installed = Bun.spawnSync({
        cmd: [join(binDir, "situ")],
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(installed.exitCode).toBe(0);
      expect(installed.stdout.toString()).toBe("fake situ\n");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

function runScript(
  scriptPath: string,
  env: Record<string, string>,
  args: readonly string[] = [],
): ScriptResult {
  const childEnv = buildReleaseScriptEnvironment(env);
  const result = Bun.spawnSync({
    cmd: ["sh", scriptPath, ...args],
    cwd: repoRoot,
    env: childEnv,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function buildReleaseScriptEnvironment(env: Record<string, string>): Record<string, string> {
  const childEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }

  for (const key of [
    "SITU_VERSION",
    "SITU_RELEASE_TARBALL",
    "SITU_RELEASE_REPO",
    "SITU_INSTALL_HOME",
    "SITU_BIN_DIR",
    "GH_TOKEN",
    "GITHUB_TOKEN",
  ]) {
    delete childEnv[key];
  }

  return { ...childEnv, ...env };
}

function expectedVersionError(version: string): string {
  if (version === "") {
    return "Missing required environment variable: SITU_VERSION";
  }

  return `SITU_VERSION must be shaped vX.Y.Z or 0.0.0-dev, got: ${version}`;
}

function formatVersionName(version: string): string {
  return version === "" ? "an empty version" : version;
}

function mkTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "situ-release-scripts-"));
}
