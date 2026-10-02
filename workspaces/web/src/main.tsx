import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Link,
  useParams,
} from "@tanstack/react-router";
import * as stylex from "@stylexjs/stylex";
import { styles as s } from "./styles";
import { connect, useResearch } from "./state";
import { Home, Dashboard } from "./dashboard";
import { Detail } from "./detail";
import "./base.css";

function Shell() {
  const { snapshot, connection, error } = useResearch();
  const { projectId } = useParams({ strict: false });
  const [showNavigation, setShowNavigation] = useState(false);
  return (
    <div {...stylex.props(s.shell)}>
      <aside {...stylex.props(s.sidebar)}>
        <div {...stylex.props(s.sidebarHead)}>
          <Link to="/" {...stylex.props(s.brand)}>
            <span {...stylex.props(s.brandIcon)}>s</span>situ
          </Link>
          <button
            {...stylex.props(s.button, s.navigationToggle)}
            aria-expanded={showNavigation}
            aria-controls="workspace-navigation"
            onClick={() => setShowNavigation(!showNavigation)}
          >
            {showNavigation ? "Hide projects" : "Show projects"}
          </button>
        </div>
        <nav
          id="workspace-navigation"
          {...stylex.props(s.nav, !showNavigation && s.navigationCollapsed)}
          aria-label="Workspace"
        >
          <Link
            to="/"
            {...stylex.props(s.navLink, !projectId && s.selected)}
            onClick={() => setShowNavigation(false)}
          >
            ▦ All projects
          </Link>
          <div {...stylex.props(s.eyebrow)} style={{ margin: "20px 10px 8px" }}>
            Projects
          </div>
          {snapshot?.projects.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              onClick={() => setShowNavigation(false)}
              {...stylex.props(
                s.navLink,
                project.id === projectId && s.selected,
              )}
            >
              {project.title}
            </Link>
          ))}
        </nav>
        <div {...stylex.props(s.footer)}>
          <div {...stylex.props(s.row)}>
            <span
              {...stylex.props(s.dot, connection === "live" && s.liveDot)}
            />
            {connection === "live"
              ? "Live · local workspace"
              : connection === "offline"
                ? "Reconnecting…"
                : "Connecting…"}
          </div>
          <span>Durable research, shared context.</span>
          {snapshot && (
            <span {...stylex.props(s.mono)}>revision {snapshot.cursor}</span>
          )}
        </div>
      </aside>
      <main {...stylex.props(s.content)}>
        {error && (
          <div role="alert" {...stylex.props(s.error)}>
            Showing the last received data. {error}
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
const root = createRootRoute({
  component: Shell,
  notFoundComponent: () => (
    <p>
      Page not found. <Link to="/">Open workspace</Link>
    </p>
  ),
});
const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: Home,
});
const project = createRoute({
  getParentRoute: () => root,
  path: "/projects/$projectId",
  component: Dashboard,
});
const record = createRoute({
  getParentRoute: () => root,
  path: "/projects/$projectId/records/$recordId",
  component: Detail,
});
const router = createRouter({
  routeTree: root.addChildren([home, project, record]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
connect();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
