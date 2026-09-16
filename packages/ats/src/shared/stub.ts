// Placeholder connector for vendors whose folder has not been built yet. A vendor folder
// replaces its stub with a real connector; the registry needs no change.
import type { AtsKind } from "@pemby/core/private-config";
import type { AtsConnector } from "./types";

const stubs = new WeakSet<AtsConnector>();

export function notImplementedConnector(kind: AtsKind): AtsConnector {
  const connector: AtsConnector = {
    kind,
    rateLimits: {},
    listJobs() {
      return Promise.reject(new Error(`ATS connector "${kind}" is not implemented yet`));
    },
  };
  stubs.add(connector);
  return connector;
}

export function isStubConnector(connector: AtsConnector): boolean {
  return stubs.has(connector);
}
