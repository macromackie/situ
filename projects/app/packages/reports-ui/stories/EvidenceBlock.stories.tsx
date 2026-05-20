import type { Meta, StoryObj } from "@storybook/react";

import { EvidenceBlock } from "../src/components/EvidenceBlock.js";

const meta: Meta<typeof EvidenceBlock> = {
  title: "Report/EvidenceBlock",
  component: EvidenceBlock,
};

export default meta;

type Story = StoryObj<typeof EvidenceBlock>;

export const Default: Story = {
  args: {
    experimentId: "experiment_case",
    title: "Case and accent folding",
    status: "accepted",
    actor: "scientist-1",
    branchName: "candidate/case-normalize",
    baseRef: "0a1b2c3",
    worktreePath: "/tmp/worktrees/candidate-case-normalize",
    summaryMarkdown:
      "Switched normalize_case to NFKD + ASCII fold, kept smart-cased acronyms as a hard list. Improved dev_accuracy from 0.6314 to 0.6701 without regressing throughput.",
    measurements: [
      { metricName: "dev_accuracy", value: 0.6701, revisionNumber: 3, actor: "verifier-1" },
      { metricName: "dev_wps", value: 17880, unit: "wps", revisionNumber: 1, actor: "verifier-1" },
      { metricName: "final_accuracy", value: 0.6788, revisionNumber: 3, actor: "verifier-1" },
    ],
    reviews: [
      {
        decision: "approved",
        reviewer: "Scott Mackie",
        body: "Clean diff scoped to case.py. Acronym hard list is small but justified. Accept.",
      },
    ],
    attachments: [],
  },
};

export const Empty: Story = {
  args: {
    experimentId: "experiment_empty",
    title: "Empty candidate",
    status: "running",
  },
};
