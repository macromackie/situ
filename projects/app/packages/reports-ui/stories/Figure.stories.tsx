import type { Meta, StoryObj } from "@storybook/react";

import { Figure } from "../src/components/Figure.js";
import { ProgressChart } from "../src/components/ProgressChart.js";
import { populatedMetricSeries } from "../src/fixtures/index.js";

const meta: Meta<typeof Figure> = {
  title: "Report/Figure",
  component: Figure,
};

export default meta;

type Story = StoryObj<typeof Figure>;

export const Default: Story = {
  args: {
    number: 1,
    kind: "hero",
    caption:
      "dev_accuracy over experiment ordinal (higher is better). 5 experiments, 5 measured, 4 kept improvements. Baseline marked at ordinal 0.",
    children: <ProgressChart series={populatedMetricSeries} />,
  },
};
