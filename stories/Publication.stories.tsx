import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { exampleView } from "./fixtures.js";
import { PublicationContext } from "../src/web/publication/context.js";
import { PublishedPage } from "../src/web/publication/renderer.js";
import { Figure } from "../src/web/figures/index.js";
import { Updates } from "../src/web/publication/views.js";
import {
  SelectField,
  IconButton,
  NavigationRow,
} from "../src/web/components/index.js";
import { X } from "lucide-react";
import type { SourceRef } from "../src/protocol/publication/index.js";
function Canvas({ children }: { children?: React.ReactNode }) {
  const [sources, setSources] = useState<SourceRef[]>([]);
  return (
    <PublicationContext.Provider
      value={{ view: exampleView, inspect: setSources }}
    >
      <div style={{ background: "#eaf0f4", padding: 14, minHeight: "100vh" }}>
        <div className="sheet">
          <div className="reading publication-content">
            {children}
            {sources.length > 0 && (
              <aside className="source-record">
                <strong>Saved sources</strong>
                <IconButton
                  label="Close saved sources"
                  onClick={() => setSources([])}
                >
                  <X size={12} />
                </IconButton>
                {sources.map((s) => (
                  <pre key={s.recordId}>
                    {JSON.stringify(
                      exampleView.sources[s.snapshotId]?.records[s.recordId],
                      null,
                      2,
                    )}
                  </pre>
                ))}
              </aside>
            )}
          </div>
        </div>
      </div>
    </PublicationContext.Provider>
  );
}
const meta = {
  title: "Publication/Accounts",
  component: Canvas,
} satisfies Meta<typeof Canvas>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Now: Story = {
  render: () => (
    <Canvas>
      <PublishedPage page={exampleView.release!.document.pages[0]} />
    </Canvas>
  ),
};
export const Question: Story = {
  render: () => (
    <Canvas>
      <PublishedPage page={exampleView.release!.document.pages[1]} />
    </Canvas>
  ),
};
export const Developments: Story = {
  render: () => (
    <Canvas>
      <Updates view={exampleView} />
    </Canvas>
  ),
};
export const AllFigures: Story = {
  render: () => (
    <Canvas>
      {exampleView.release!.document.figures.map((f) => (
        <Figure key={f.id} value={f} />
      ))}
    </Canvas>
  ),
};
export const MissingMedia: Story = {
  render: () => (
    <Canvas>
      <Figure
        value={
          {
            ...exampleView.release!.document.figures[4],
            assetId: "missing",
          } as any
        }
      />
    </Canvas>
  ),
};
export const Controls: Story = {
  render: () => {
    const [value, setValue] = useState("all");
    return (
      <Canvas>
        <div className="figure-toolbar">
          <SelectField
            label="Scenario"
            value={value}
            onChange={setValue}
            options={[
              { value: "all", label: "All scenarios" },
              { value: "corridor", label: "Corridor" },
              { value: "delay", label: "Delayed cue" },
            ]}
          />
          <span>{value}</span>
        </div>
        <div className="question-list">
          <NavigationRow
            href="#question"
            title="Does the policy retain the cue?"
            detail="A controlled delay comparison is pending."
            meta="→"
          />
        </div>
      </Canvas>
    );
  },
};
