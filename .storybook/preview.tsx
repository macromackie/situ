import React from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import type { Preview } from "@storybook/react-vite";
import "../src/web/styles.css";
import "../src/web/styles/publication.css";
const preview: Preview = {
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Tooltip.Provider>
        <Story />
      </Tooltip.Provider>
    ),
  ],
};
export default preview;
