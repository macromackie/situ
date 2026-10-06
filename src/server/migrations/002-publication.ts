export default `
CREATE TABLE publication_drafts (project TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE publication_releases (project TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(project,revision));
CREATE TABLE publication_sources (id TEXT PRIMARY KEY, project TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX publication_source_scope ON publication_sources(project);
CREATE TABLE assets (id TEXT PRIMARY KEY, project TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX asset_scope ON assets(project);
`;
