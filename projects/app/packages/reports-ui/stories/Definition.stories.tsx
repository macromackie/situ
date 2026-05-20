import type { Meta, StoryObj } from "@storybook/react";

import { Definition } from "../src/components/Definition.js";

const meta: Meta<typeof Definition> = {
  title: "Report/Definition",
  component: Definition,
};

export default meta;

type Story = StoryObj<typeof Definition>;

export const Inline: Story = {
  args: {
    term: "synthesis branch",
    children:
      "a follow-up experiment that cherry-picks compatible improvements from sibling candidates.",
  },
};

export const TermOnly: Story = {
  args: { term: "running best" },
};
