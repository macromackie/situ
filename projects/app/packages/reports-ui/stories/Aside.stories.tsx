import type { Meta, StoryObj } from "@storybook/react";

import { ReportAside } from "../src/components/Aside.js";

const meta: Meta<typeof ReportAside> = {
  title: "Report/Aside",
  component: ReportAside,
};

export default meta;

type Story = StoryObj<typeof ReportAside>;

export const Default: Story = {
  args: {
    children:
      "Sidenote — the eval harness runs each candidate in its own git worktree so candidates cannot stomp on each other while the manager fans them out.",
  },
};
