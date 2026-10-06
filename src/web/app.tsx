import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tooltip } from "@base-ui/react/tooltip";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  FlaskConical,
  GitBranch,
  Radio,
  ScanLine,
} from "lucide-react";
import { useResource } from "./api.js";
import { Inspector } from "./inspector/index.js";
import { Publication, ProjectSummary } from "./publication/views.js";
import "./styles.css";
import "./styles/publication.css";

type Project = { id: string; title: string };
function ProjectNavigation({
  project,
  route,
}: {
  project: Project;
  route: string;
}) {
  const active =
    route === `/projects/${project.id}` ||
    route.startsWith(`/projects/${project.id}/`);
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  return (
    <div className="project-navigation">
      <div className="project-nav-title">
        <button
          aria-label={`${open ? "Collapse" : "Expand"} ${project.title}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <a
          href={`#/projects/${project.id}`}
          className={active ? "selected" : ""}
        >
          <GitBranch size={13} />
          <span>{project.title}</span>
        </a>
      </div>
      {open && (
        <div className="project-nav-children">
          {[
            ["", "Now"],
            ["/timeline", "Timeline"],
            ["/updates", "Updates"],
          ].map(([path, title]) => (
            <a
              key={path}
              href={`#/projects/${project.id}${path}`}
              aria-current={
                route === `/projects/${project.id}${path}` ? "page" : undefined
              }
            >
              {title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
export function App() {
  const [location, setLocation] = useState(
    window.location.hash.slice(1) || "/projects",
  );
  useEffect(() => {
    const change = () =>
      setLocation(window.location.hash.slice(1) || "/projects");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const [route, query = ""] = location.split("?");
  const parts = route.split("/").filter(Boolean);
  const projects = useResource<{ items: Project[]; nextCursor: string | null }>(
    "/v1/projects?limit=100",
  );
  const project = projects.data?.items.find((p) => p.id === parts[1]);
  const isInspect =
    parts[0] === "inspect" || parts[0] === "topics" || parts[0] === "work";
  const inspectorRoute =
    parts[0] === "inspect" ? "/" + parts.slice(1).join("/") : route;
  return (
    <Tooltip.Provider>
      <div className="shell">
        <nav className="sidebar" aria-label="Main navigation">
          <a className="brand" href="#/projects">
            <span>situ</span>
            <small>RESEARCH OBSERVATORY</small>
          </a>
          <a
            href="#/projects"
            className={route === "/projects" ? "selected" : ""}
          >
            <Compass size={15} />
            All research
          </a>
          <div className="nav-label">Projects</div>
          {projects.data?.items.map((p) => (
            <ProjectNavigation key={p.id} project={p} route={route} />
          ))}
          {projects.error && (
            <p className="nav-error">Cannot refresh projects.</p>
          )}
          {projects.data?.nextCursor && (
            <p className="nav-error">Showing the first 100 projects.</p>
          )}
          <div className="sidebar-bottom">
            <a
              href={`#/inspect/projects/${project?.id ?? projects.data?.items[0]?.id ?? ""}`}
            >
              <ScanLine size={13} />
              Inspect research
            </a>
          </div>
        </nav>
        <div className="sheet">
          <header className="pagebar">
            <span>
              <FlaskConical size={14} />
              {isInspect ? "Inspect" : (project?.title ?? "Research")}
              {parts[2] && !isInspect && (
                <>
                  <span className="breadcrumb-separator">/</span>
                  {parts[2] === "pages"
                    ? "Question"
                    : parts[2] === "updates"
                      ? "Updates"
                      : "Timeline"}
                </>
              )}
            </span>
            <a
              href="#/projects"
              className="workspace-link"
              aria-label="All research"
            >
              <Radio size={13} />
            </a>
          </header>
          {project && !isInspect && (
            <nav className="mobile-project-nav" aria-label="Project views">
              {[
                ["", "Now"],
                ["/timeline", "Timeline"],
                ["/updates", "Updates"],
              ].map(([path, title]) => (
                <a
                  key={path}
                  href={`#/projects/${project.id}${path}`}
                  aria-current={
                    route === `/projects/${project.id}${path}`
                      ? "page"
                      : undefined
                  }
                >
                  {title}
                </a>
              ))}
            </nav>
          )}
          <main
            key={route}
            className={isInspect ? "inspect-main" : "publication-main"}
          >
            {isInspect ? (
              inspectorRoute === "/projects/" ? (
                <p className="empty">No projects yet.</p>
              ) : (
                <Inspector key={inspectorRoute} route={inspectorRoute} />
              )
            ) : project || (parts[0] === "projects" && parts[1]) ? (
              <Publication
                key={parts[1] + query}
                projectId={parts[1]}
                section={parts[2]}
                pageId={parts[2] === "pages" ? parts[3] : undefined}
                query={query ? "?" + query : ""}
              />
            ) : (
              <div className="reading publication-content">
                <header className="publication-heading">
                  <div className="eyebrow">SITU / RESEARCH OBSERVATORY</div>
                  <h1>Research now</h1>
                  <p>
                    The current understanding, with a path back to the evidence.
                  </p>
                </header>
                {projects.error && <p className="notice">{projects.error}</p>}
                <div className="project-list">
                  {projects.data?.items.map((p) => (
                    <ProjectSummary key={p.id} id={p.id} />
                  ))}
                </div>
                {projects.data?.items.length === 0 && (
                  <p className="empty">
                    No projects yet. Start a project with the Situ CLI; its
                    published account will appear here.
                  </p>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
