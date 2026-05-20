import type { Meta, StoryObj } from "@storybook/react";

import { MetricCard } from "../src/components/MetricCard.js";

const meta: Meta<typeof MetricCard> = {
  title: "Report/MetricCard",
  component: MetricCard,
};

export default meta;

type Story = StoryObj<typeof MetricCard>;

export const Improvement: Story = {
  args: {
    metric: "dev_accuracy",
    value: 0.6814,
    delta: 0.05,
    direction: "higher",
    source: "experiment_synthesis",
    label: "Synthesis dev_accuracy",
  },
};

export const Regression: Story = {
  args: {
    metric: "dev_accuracy",
    value: 0.6261,
    delta: -0.0053,
    direction: "higher",
    source: "experiment_whitespace",
  },
};

export const Bare: Story = {
  args: {
    metric: "dev_wps",
    value: 17040,
    unit: "wps",
    source: "experiment_synthesis",
  },
};
