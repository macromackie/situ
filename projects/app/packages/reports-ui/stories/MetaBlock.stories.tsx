import type { Meta, StoryObj } from "@storybook/react";

import { ActorList, MetaBlock, MetaColumn } from "../src/components/MetaBlock.js";
import { populatedActors } from "../src/fixtures/index.js";

const meta: Meta<typeof MetaBlock> = {
  title: "Report/MetaBlock",
  component: MetaBlock,
};

export default meta;

type Story = StoryObj<typeof MetaBlock>;

export const Default: Story = {
  render: () => (
    <MetaBlock>
      <MetaColumn label="Actors">
        <ActorList actors={populatedActors} />
      </MetaColumn>
      <MetaColumn label="Run">
        <p className="meta-value">May 15, 2026 → May 15, 2026</p>
        <p className="meta-sub">15 min</p>
      </MetaColumn>
      <MetaColumn label="Repository">
        <p className="meta-value mono">
          /Users/scott/situ/projects/evals/workspaces/branching-normalizer
        </p>
        <p className="meta-sub">project project_normalizer</p>
      </MetaColumn>
      <MetaColumn label="Headline">
        <p className="meta-value">dev_accuracy 0.6814</p>
        <p className="meta-sub">↑ 0.05 vs. baseline</p>
      </MetaColumn>
    </MetaBlock>
  ),
};
