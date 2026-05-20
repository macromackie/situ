import type { Database } from "bun:sqlite";
import type { IsoTimestamp, SituId } from "@situ/common";

export type SituVerifyCheckName =
  | "has-project"
  | "no-active-tasks"
  | "no-active-experiments"
  | "accepted-experiments-reviewed"
  | "accepted-experiments-have-evidence"
  | "final-report-present";

export type SituVerifyBlockingRecord = {
  readonly targetKind:
    | "project"
    | "task"
    | "experiment"
    | "review"
    | "measurement"
    | "artifact"
    | "report";
  readonly targetId: string;
  readonly reason: string;
};

export type SituVerifyCheck = {
  readonly name: SituVerifyCheckName;
  readonly ok: boolean;
  readonly summary: string;
  readonly blockingRecords: readonly SituVerifyBlockingRecord[];
};

export type SituVerifyOutput = {
  readonly generatedAt: IsoTimestamp;
  readonly repositoryPath?: string;
  readonly projectIds: readonly SituId<"project">[];
  readonly ok: boolean;
  readonly checks: readonly SituVerifyCheck[];
};

export type VerifySituInput = {
  readonly database: Database;
  readonly projectId?: SituId<"project">;
  readonly repositoryPath?: string;
  readonly generatedAt?: IsoTimestamp;
};
