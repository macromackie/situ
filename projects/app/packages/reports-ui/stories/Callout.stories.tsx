import type { Meta, StoryObj } from "@storybook/react";

import { Callout } from "../src/components/Callout.js";

const meta: Meta<typeof Callout> = {
  title: "Report/Callout",
  component: Callout,
};

export default meta;

type Story = StoryObj<typeof Callout>;

export const Finding: Story = {
  args: {
    kind: "finding",
    children:
      "The combined synthesis branch lifts dev_accuracy from 0.6314 to 0.6814, beating every single-candidate branch.",
  },
};

export const Warning: Story = {
  args: {
    kind: "warning",
    children:
      "Whitespace collapse regressed throughput on code-like inputs and was excluded from synthesis.",
  },
};

export const Note: Story = {
  args: {
    kind: "note",
    children:
      "Manager fell back to direct execution because native subagents were not available in this run.",
  },
};
