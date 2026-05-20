import type { Meta, StoryObj } from "@storybook/react";

import { SmallMultiples } from "../src/components/SmallMultiples.js";
import { populatedMetricSeries } from "../src/fixtures/index.js";
import type { MetricSeries } from "../src/types.js";

const wps: MetricSeries = {
  metricName: "dev_wps",
  unit: "wps",
  direction: "higher",
  baselineValue: 18420,
  bestValue: 17880,
  points: [
    { experimentOrdinal: 0, value: 18420, origin: "baseline" },
    { experimentOrdinal: 1, value: 17880, origin: "experiment", experimentId: "experiment_case" },
    { experimentOrdinal: 2, value: 17110, origin: "experiment", experimentId: "experiment_punct" },
  ],
};

const meta: Meta<typeof SmallMultiples> = {
  title: "Report/SmallMultiples",
  component: SmallMultiples,
};

export default meta;

type Story = StoryObj<typeof SmallMultiples>;

export const Default: Story = {
  args: { series: [populatedMetricSeries, wps] },
};
