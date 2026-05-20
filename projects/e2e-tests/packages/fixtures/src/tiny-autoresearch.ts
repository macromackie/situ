import type { TestFixture } from "./types.js";

export const tinyAutoresearchFixture = {
  name: "tiny-autoresearch",
  goal: "Verify that Situ carries an autoresearch project from repository discovery through task handoff.",
  actors: [
    { actorId: "human", role: "owner" },
    { actorId: "local-agent", role: "researcher" },
  ],
  repositoryFiles: [
    {
      path: "README.md",
      content: "# Tiny Autoresearch Fixture\n",
    },
  ],
  expectedAssertions: [
    "situ --version returns the requested build version",
    "situ doctor returns a successful health message",
    "situ projects init creates a project for the materialized repository",
    "situ projects current recovers the active project from the current repository",
    "situ tasks current lists tasks for active projects in the current repository",
    "assigned tasks create unread notifications for the assigned actor",
  ],
} satisfies TestFixture;
