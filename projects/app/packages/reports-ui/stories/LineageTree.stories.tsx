import type { Meta, StoryObj } from "@storybook/react";

import { LineageTree } from "../src/components/LineageTree.js";
import {
  emptyLineageEdges,
  emptyLineageNodes,
  populatedLineageEdges,
  populatedLineageNodes,
} from "../src/fixtures/index.js";

const meta: Meta<typeof LineageTree> = {
  title: "Report/LineageTree",
  component: LineageTree,
};

export default meta;

type Story = StoryObj<typeof LineageTree>;

export const Populated: Story = {
  args: { nodes: populatedLineageNodes, edges: populatedLineageEdges },
};

export const Empty: Story = {
  args: { nodes: emptyLineageNodes, edges: emptyLineageEdges },
};
