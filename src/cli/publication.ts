import { command, json, request, type Credentials } from "./connection.js";
export async function publicationCli(
  verb: string,
  sub: string,
  id: string | undefined,
  options: Record<string, any>,
  credentials: Credentials,
): Promise<boolean> {
  if (verb !== "publication" && verb !== "brief") return false;
  const project = verb === "brief" ? sub : id;
  const path = `/v1/publication/projects/${project}`;
  let result: unknown;
  if (verb === "brief") {
    result = await request(path + "/brief", credentials);
    if (options.since) {
      const previous = await request(
        path + "?revision=" + options.since,
        credentials,
      );
      const current = result as any;
      current.since = Number(options.since);
      current.updates = (await request(path + "/updates", credentials)).filter(
        (u: any) =>
          !previous.release.document.updates.some((p: any) => p.id === u.id),
      );
    }
  } else if (sub === "save") {
    if (!options.file)
      throw new Error("Use --file with the publication.save input");
    result = await command(
      "publication.save",
      await json(options.file),
      credentials,
    );
  } else {
    if (!project) throw new Error("Specify a project ID");
    if (sub === "capture")
      result = await command(
        "publication.capture",
        {
          ...(options.file ? await json(options.file) : {}),
          projectId: project,
          ...(options.after !== undefined
            ? { after: Number(options.after) }
            : {}),
        },
        credentials,
      );
    else if (sub === "show")
      result = await request(
        path +
          (options.draft
            ? "/draft"
            : options.revision
              ? "?revision=" + options.revision
              : ""),
        credentials,
      );
    else if (sub === "validate")
      result = await request(path + "/validate", credentials);
    else if (sub === "publish" || sub === "archive") {
      if (
        !options["expected-revision"] ||
        options["expected-release"] === undefined
      )
        throw new Error(
          "Provide --expected-revision and --expected-release from the draft and current publication",
        );
      const input: Record<string, unknown> = {
        projectId: project,
        expectedRevision: Number(options["expected-revision"]),
        expectedRelease: Number(options["expected-release"]),
      };
      if (sub === "archive") {
        input.pageId = options.page;
        input.reason = options.reason;
      }
      result = await command("publication." + sub, input, credentials);
    } else
      throw new Error(
        "Use publication capture, save, show, validate, publish, or archive",
      );
  }
  if (sub === "validate" && (result as any).issues.length) process.exitCode = 1;
  console.log(JSON.stringify(result, null, 2));
  return true;
}
