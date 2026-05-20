import type { Meta, StoryObj } from "@storybook/react";

import { Hero } from "../src/components/Hero.js";

const meta: Meta<typeof Hero> = {
  title: "Report/Hero",
  component: Hero,
};

export default meta;

type Story = StoryObj<typeof Hero>;

export const Default: Story = {
  args: {
    kicker: "Situ research report",
    title: "Branching text normalizer",
    lede: 'A live record of "Branching text normalizer" autoresearch. 5 candidate experiments across 5 tasks. dev_accuracy improved from 0.6314 at baseline to 0.6814 at best (higher is better).',
    dateline: {
      openedAt: "2026-05-15T09:00:00.000Z",
      openedAtLabel: "May 15, 2026",
      openedBy: "Scott Mackie",
      generatedAt: "2026-05-15T09:17:00.000Z",
      generatedAtLabel: "May 15, 2026",
    },
  },
};

export const Minimal: Story = {
  args: { title: "Scratch run" },
};
