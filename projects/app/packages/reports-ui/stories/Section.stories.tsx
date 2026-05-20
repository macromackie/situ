import type { Meta, StoryObj } from "@storybook/react";

import { Section } from "../src/components/Section.js";

const meta: Meta<typeof Section> = {
  title: "Report/Section",
  component: Section,
};

export default meta;

type Story = StoryObj<typeof Section>;

export const Default: Story = {
  args: {
    id: "progress",
    number: 3,
    title: "Progress",
    children: (
      <p className="prose">
        Across 5 experiments, 4 produced a new running best on dev_accuracy (higher is better). All
        experiment measurements appear in Figure 1; the stepped line is the running best.
      </p>
    ),
  },
};
