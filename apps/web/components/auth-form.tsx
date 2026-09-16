"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { SIGN_UP_CLOSED } from "@/lib/auth/codes";

type Failure = "failed" | "signUpClosed" | null;

function failureFor(error: { code?: string | undefined } | null): Failure {
  if (!error) return null;
  return error.code === SIGN_UP_CLOSED ? "signUpClosed" : "failed";
}

/** Email and password form for /sign-in and /sign-up. From an anonymous session this also claims its data. */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setPending(true);
    setFailure(null);
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: "" })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      setFailure(failureFor(error));
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <p>
        <label>
          {t("email")} <input name="email" type="email" autoComplete="email" required />
        </label>
      </p>
      <p>
        <label>
          {t("password")}{" "}
          <input
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </label>
        {mode === "sign-up" ? <small> {t("passwordHint")}</small> : null}
      </p>
      {failure ? <p role="alert">{t(failure)}</p> : null}
      <button type="submit" disabled={pending}>
        {mode === "sign-up"
          ? pending
            ? t("signingUp")
            : t("signUp")
          : pending
            ? t("signingIn")
            : t("signIn")}
      </button>
    </form>
  );
}

/** Starts an anonymous session (PLAN D4) so data can be created now and claimed on sign-up. */
export function ContinueAnonymouslyButton() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);

  async function onClick() {
    setPending(true);
    setFailure(null);
    const { error } = await authClient.signIn.anonymous();
    setPending(false);
    if (error) {
      setFailure(failureFor(error));
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <p>
      <button type="button" onClick={onClick} disabled={pending}>
        {pending ? t("startingAnonymous") : t("continueAnonymously")}
      </button>
      {failure ? <span role="alert"> {t(failure)}</span> : null}
    </p>
  );
}

export function SignOutButton() {
  const t = useTranslations("Auth");
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
        router.refresh();
      }}
    >
      {t("signOut")}
    </button>
  );
}
