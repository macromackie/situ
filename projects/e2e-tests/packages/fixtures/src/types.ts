export type FixtureActor = {
  readonly actorId: string;
  readonly role: string;
};

export type FixtureRepositoryFile = {
  readonly path: string;
  readonly content: string;
};

export type TestFixture = {
  readonly name: string;
  readonly goal: string;
  readonly actors: readonly FixtureActor[];
  readonly repositoryFiles: readonly FixtureRepositoryFile[];
  readonly expectedAssertions: readonly string[];
};
