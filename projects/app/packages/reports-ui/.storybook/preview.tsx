import type { Preview } from "@storybook/react";

import { reportBaseCss } from "../src/styles/index.js";

const styleId = "situ-reports-ui-preview";
if (typeof document !== "undefined" && document.getElementById(styleId) === null) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = reportBaseCss;
  document.head.appendChild(style);
}

const preview: Preview = {
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "paper",
      values: [
        { name: "paper", value: "#fffdf8" },
        { name: "white", value: "#ffffff" },
      ],
    },
  },
};

export default preview;
