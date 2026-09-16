// Connector registry. One line per vendor, already written: vendor work happens only inside
// src/<vendor>/, never here.
import type { AtsKind } from "@pemby/core/private-config";
import { ashbyConnector } from "./ashby";
import { greenhouseConnector } from "./greenhouse";
import { leverConnector } from "./lever";
import { personioConnector } from "./personio";
import { recruiteeConnector } from "./recruitee";
import type { HttpClient, HttpClientOptions, HostRateLimit } from "./shared/http";
import { createHttpClient } from "./shared/http";
import { isStubConnector } from "./shared/stub";
import type { AtsConnector } from "./shared/types";
import { smartrecruitersConnector } from "./smartrecruiters";
import { workableConnector } from "./workable";

const CONNECTORS: Readonly<Record<AtsKind, AtsConnector>> = {
  greenhouse: greenhouseConnector,
  lever: leverConnector,
  ashby: ashbyConnector,
  workable: workableConnector,
  smartrecruiters: smartrecruitersConnector,
  recruitee: recruiteeConnector,
  personio: personioConnector,
};

/** True when `kind` has a real connector (not the placeholder). */
export function isConnectorImplemented(kind: AtsKind): boolean {
  return !isStubConnector(CONNECTORS[kind]);
}

/** The connector for `kind`. Throws a plain Error (not AtsError) while it is still a placeholder. */
export function getConnector(kind: AtsKind): AtsConnector {
  const connector = CONNECTORS[kind];
  if (!connector) throw new Error(`unknown ATS kind "${String(kind)}"`);
  if (isStubConnector(connector)) {
    throw new Error(`ATS connector "${kind}" is not implemented yet`);
  }
  return connector;
}

/**
 * One HTTP client for the whole process, with every connector's host limits merged in. Create it
 * once at worker boot and pass it in each ConnectorContext, so limits hold across concurrent jobs.
 */
export function createAtsHttpClient(
  options: Omit<HttpClientOptions, "hostLimits"> = {},
): HttpClient {
  const hostLimits: Record<string, HostRateLimit> = {};
  for (const connector of Object.values(CONNECTORS))
    Object.assign(hostLimits, connector.rateLimits);
  return createHttpClient({ ...options, hostLimits });
}
