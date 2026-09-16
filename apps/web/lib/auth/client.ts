"use client";

import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Same-origin: the client calls /api/auth/* on the site that served the page.
export const authClient = createAuthClient({
  plugins: [anonymousClient()],
});
