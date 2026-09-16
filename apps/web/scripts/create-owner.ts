// Create an owner account (email + password) through Better Auth's server API, so the password is
// hashed exactly as sign-in expects. Production has public sign-up closed; this is how owners get
// in. The email must be on OWNER_ALLOWLIST_EMAILS and must not exist yet.
//
//   pnpm --filter @pemby/web create-owner                        # prompts on the TTY
//   pnpm --filter @pemby/web create-owner --email a@b.c < file   # password from stdin (first line)
//
// Against an environment: railway run --environment production --service web -- \
//   pnpm --filter @pemby/web create-owner
import { createInterface } from "node:readline/promises";
import { getDb } from "@pemby/db";
import { isAllowlistedEmail } from "@/lib/access/owner-gate";
import { getAuth } from "@/lib/auth/server";
import { appEnv } from "@/lib/env";

const ENTER = new Set(["\r", "\n", String.fromCharCode(4)]);
const CTRL_C = String.fromCharCode(3);
const BACKSPACE = new Set([String.fromCharCode(127), String.fromCharCode(8)]);

function fail(message: string): never {
  console.error(`create-owner: ${message}`);
  process.exit(1);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Read a password from the TTY without echoing it. */
async function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stderr.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (ENTER.has(char)) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (char === CTRL_C) {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (BACKSPACE.has(char)) value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function readStdinFirstLine(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) data += String(chunk);
  return data.split(/\r?\n/)[0] ?? "";
}

async function main() {
  const env = appEnv();
  const interactive = Boolean(process.stdin.isTTY);

  const email = (argValue("--email") ?? (interactive ? await promptLine("Email: ") : "")).trim();
  if (!email) fail("an email is required (--email when stdin is not a TTY)");
  if (!isAllowlistedEmail(email)) fail("that email is not in OWNER_ALLOWLIST_EMAILS");

  const db = getDb();
  const existing = await db.$client.query(`select 1 from "user" where lower(email) = lower($1)`, [
    email,
  ]);
  if (existing.rowCount) fail("a user with that email already exists");

  let password: string;
  if (interactive) {
    password = await promptHidden("Password: ");
    const repeat = await promptHidden("Repeat password: ");
    if (password !== repeat) fail("passwords do not match");
  } else {
    password = await readStdinFirstLine();
  }
  if (password.length < 8) fail("the password must be at least 8 characters");

  // No request or headers: a trusted server-side call, allowed while production sign-up is closed
  // (see `user.validateUserInfo` in lib/auth/server.ts).
  const result = await getAuth().api.signUpEmail({ body: { email, password, name: "" } });
  // Sign-up signs the new user in; the script has no use for that session.
  await db.$client.query("delete from session where user_id = $1", [result.user.id]);

  console.error(`create-owner: created ${result.user.email} (APP_ENV=${env})`);
  await db.$client.end();
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
