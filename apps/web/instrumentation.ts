// Startup checks for the web service.
//
// Next.js calls `register()` once when a server instance boots (Next 16 `instrumentation.ts`).
// That makes it the only place in `apps/web` where a missing environment variable can be found by
// the deploy rather than by a person.
//
// **Why `AI_USER_KEY_SECRET` is asserted here.** `packages/ai/src/user-key.ts` deliberately
// validates it on first use rather than at module load, because `@pemby/ai` is imported by pages
// that have no business needing an encryption secret and a module-load throw would take one of
// them out. The consequence is that a deploy missing the variable looks perfectly healthy until
// the first person tries to connect their OpenRouter account — at which point they are the one who
// finds out. Asserting it at boot moves that discovery to where it belongs.
//
// **Two guards, both deliberate.**
//
//   - **Not during `next build`.** A build has no runtime environment and no business holding a
//     production secret; a build that failed on a missing one would make CI depend on a value it
//     must never be given.
//   - **A warning, not a throw, in development.** Outside development the service refuses to start,
//     which is the point. In development a missing secret means the one feature that needs it does
//     not work, and taking the whole dev server down over it would stop everybody else's work on
//     everything else. The warning prints the variable's **name**; nothing here ever prints a value.

export async function register(): Promise<void> {
  // Edge and build-time invocations have no business asserting a Node-only secret.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { assertUserKeySecret, UserKeyError } = await import("@pemby/ai");
  const { appEnv } = await import("./lib/env");

  try {
    assertUserKeySecret();
  } catch (error) {
    if (!(error instanceof UserKeyError)) throw error;
    if (appEnv() === "development") {
      console.warn(
        `[web] AI_USER_KEY_SECRET is ${error.reason === "secret-missing" ? "not set" : "not 32 bytes of base64"}; connecting an OpenRouter account will not work in this environment.`,
      );
      return;
    }
    throw error;
  }
}
