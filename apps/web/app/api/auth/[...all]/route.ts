import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/server";

// Better Auth endpoints under /api/auth/* (sign-up/email, sign-in/email, sign-in/anonymous,
// sign-out, get-session, ok, and OAuth callbacks at /api/auth/callback/<provider> later).
const handler = (request: Request) => getAuth().handler(request);

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(handler);
