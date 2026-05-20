import type { Meta, StoryObj } from "@storybook/react";

import { Colophon } from "../src/components/Colophon.js";

const meta: Meta<typeof Colophon> = {
  title: "Report/Colophon",
  component: Colophon,
};

export default meta;

type Story = StoryObj<typeof Colophon>;

export const Default: Story = {
  args: {
    recordCount: 28,
    generatedAt: "2026-05-15T09:17:00.000Z",
  },
};
