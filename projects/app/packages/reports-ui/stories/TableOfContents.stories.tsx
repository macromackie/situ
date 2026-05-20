import type { Meta, StoryObj } from "@storybook/react";

import { TableOfContents } from "../src/components/TableOfContents.js";
import { populatedContents } from "../src/fixtures/index.js";

const meta: Meta<typeof TableOfContents> = {
  title: "Report/TableOfContents",
  component: TableOfContents,
};

export default meta;

type Story = StoryObj<typeof TableOfContents>;

export const Default: Story = {
  args: { items: populatedContents },
};
