---
name: situ-evidence-storage
message: Serve only registered, verified evidence and preserve it across recovery.
---

# Registered evidence

Uploads are authenticated and project-scoped. Bound byte size before registration, verify the declared SHA-256 against actual bytes, and check the allowed media signature or dataset schema. Content-addressed storage precedes registration. Only registered IDs are readable through the asset endpoint.

An exact content/metadata retry returns the same registered artifact. Conflicting media or replay metadata fails. The client preserves an upload intent before network delivery and checks original bytes and session identity before retrying.

The server never serves arbitrary filesystem paths, fetches remote URLs, or executes uploaded content. Browser evidence uses same-origin URLs, fixed media types and nosniff headers. Range requests produce correct 206 or 416 responses. Missing bytes fail visibly; the publication and source reference remain intact.

Stopped-runtime backup and restore include the R2 object store and registration database. No automatic collection removes old evidence or source snapshots. A verified file hash does not validate the scientific claim or declared replay conditions.

Checks: live hash mismatch, idempotent upload, range read, restart and snapshot restoration; publication compatibility validation.
