import type { Meta, StoryObj } from "@storybook/react";

import { Swimlanes } from "../src/components/Swimlanes.js";
import { populatedSwimlaneRange, populatedSwimlaneRows } from "../src/fixtures/index.js";

const meta: Meta<typeof Swimlanes> = {
  title: "Report/Swimlanes",
  component: Swimlanes,
};

export default meta;

type Story = StoryObj<typeof Swimlanes>;

export const Populated: Story = {
  args: {
    rows: populatedSwimlaneRows,
    startMs: populatedSwimlaneRange.startMs,
    endMs: populatedSwimlaneRange.endMs,
  },
};

export const Empty: Story = {
  args: { rows: [], startMs: 0, endMs: 0 },
};
