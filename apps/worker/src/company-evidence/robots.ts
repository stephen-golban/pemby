// A small robots.txt reader (RFC 9309): groups by user agent, Allow/Disallow with `*` and `$`,
// longest match wins, Allow wins a tie. We obey the groups naming our product token exactly
// (case-insensitive), else `*`.

export interface RobotsRules {
  /** True when `path` (pathname plus search) may be fetched. */
  isAllowed(path: string): boolean;
}

interface Rule {
  allow: boolean;
  pattern: string;
  regex: RegExp;
}

export const ALLOW_ALL: RobotsRules = { isAllowed: () => true };

function compile(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function safeDecode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/** Parses robots.txt for `productToken` (e.g. "PembyBot"), falling back to the `*` group. */
export function parseRobots(text: string, productToken: string): RobotsRules {
  const token = productToken.toLowerCase();
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      // An empty User-agent line names nobody; it neither opens nor extends a group.
      if (value === "") continue;
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (field !== "allow" && field !== "disallow")) continue;
    // An empty Disallow allows everything; it adds no rule.
    if (value === "") continue;
    current.rules.push({ allow: field === "allow", pattern: value, regex: compile(value) });
  }

  // The product token must match exactly (case-insensitive): "Pemby" or "Bot" groups are not ours.
  const named = groups.filter((g) => g.agents.includes(token));
  const chosen = named.length > 0 ? named : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  if (rules.length === 0) return ALLOW_ALL;

  return {
    isAllowed(path) {
      const target = safeDecode(path || "/");
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!rule.regex.test(target) && !rule.regex.test(path)) continue;
        if (
          !best ||
          rule.pattern.length > best.pattern.length ||
          (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
        ) {
          best = rule;
        }
      }
      return best ? best.allow : true;
    },
  };
}
