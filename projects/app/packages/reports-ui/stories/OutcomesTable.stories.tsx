import type { Meta, StoryObj } from "@storybook/react";

import { OutcomesTable } from "../src/components/OutcomesTable.js";
import { populatedOutcomeRows } from "../src/fixtures/index.js";

const meta: Meta<typeof OutcomesTable> = {
  title: "Report/OutcomesTable",
  component: OutcomesTable,
};

export default meta;

type Story = StoryObj<typeof OutcomesTable>;

export const Populated: Story = {
  args: {
    rows: populatedOutcomeRows,
    primaryMetricName: "dev_accuracy",
    direction: "higher",
  },
};

export const Empty: Story = {
  args: { rows: [], primaryMetricName: "dev_accuracy" },
};
