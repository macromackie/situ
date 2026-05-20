import type { Meta, StoryObj } from "@storybook/react";

import { BaselineCard } from "../src/components/BaselineCard.js";

const meta: Meta<typeof BaselineCard> = {
  title: "Report/BaselineCard",
  component: BaselineCard,
};

export default meta;

type Story = StoryObj<typeof BaselineCard>;

export const Default: Story = {
  args: {
    baselineId: "baseline_normalizer_native",
    title: "Unmodified harness",
    status: "active",
    summaryMarkdown:
      "Ran the unmodified normalizer harness once. The dev set is 2,041 lines; metrics are the raw harness output.",
    measurements: [
      { metricName: "dev_accuracy", value: 0.6314, actor: "Root manager" },
      { metricName: "dev_wps", value: 18420, unit: "wps", actor: "Root manager" },
      { metricName: "final_accuracy", value: 0.6471, actor: "Root manager" },
    ],
  },
};
