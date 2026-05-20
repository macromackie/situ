import type { Meta, StoryObj } from "@storybook/react";

import { ProgressChart } from "../src/components/ProgressChart.js";
import { emptyMetricSeries, populatedMetricSeries } from "../src/fixtures/index.js";

const meta: Meta<typeof ProgressChart> = {
  title: "Report/ProgressChart",
  component: ProgressChart,
};

export default meta;

type Story = StoryObj<typeof ProgressChart>;

export const Populated: Story = {
  args: { series: populatedMetricSeries },
};

export const Empty: Story = {
  args: { series: emptyMetricSeries },
};
