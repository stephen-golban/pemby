"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import {
  EMAIL_NOT_VERIFIED,
  RESET_PASSWORD_PAGE,
  SIGN_UP_CLOSED,
  VERIFY_EMAIL_PAGE,
} from "@/lib/auth/codes";

type Failure = "failed" | "signUpClosed" | "rateLimited" | null;

function failureFor(error: { code?: string | undefined; status?: number } | null): Failure {
  if (!error) return null;
  if (error.status === 429) return "rateLimited";
  return error.code === SIGN_UP_CLOSED ? "signUpClosed" : "failed";
}

/**
 * Email and password form for /sign-in and /sign-up. Sign-up ends in a "check your email" state:
 * the account is usable once the link in the email is opened (on any device), which also claims
 * the anonymous session's data. Signing in from an anonymous session claims its data at once.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  // Set when the next step is in the inbox: after sign-up, or a sign-in refused as unverified.
  const [awaiting, setAwaiting] = useState<{ email: string; reason: "signedUp" | "unverified" }>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setPending(true);
    setFailure(null);
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email,
            password,
            name: "",
            callbackURL: VERIFY_EMAIL_PAGE,
          })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      if (error.code === EMAIL_NOT_VERIFIED) {
        setAwaiting({ email, reason: "unverified" });
        return;
      }
      setFailure(failureFor(error));
      return;
    }
    if (mode === "sign-up") {
      setAwaiting({ email, reason: "signedUp" });
      return;
    }
    router.push("/app");
    router.refresh();
  }

  if (awaiting) {
    return (
      <section aria-live="polite">
        {awaiting.reason === "signedUp" ? (
          <>
            <h2>{t("checkEmailHeading")}</h2>
            <p>{t("checkEmail", { email: awaiting.email })}</p>
          </>
        ) : (
          <>
            <h2>{t("notVerifiedHeading")}</h2>
            <p>{t("notVerified")}</p>
          </>
        )}
        <ResendVerificationButton email={awaiting.email} />
      </section>
    );
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

type ResendState = "idle" | "sending" | "sent" | "failed" | "rateLimited";

/** Asks Better Auth for a new verification link (rate-limited per IP on the server). */
function useResendVerification() {
  const [state, setState] = useState<ResendState>("idle");
  async function resend(email: string) {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: VERIFY_EMAIL_PAGE,
    });
    setState(error ? (error.status === 429 ? "rateLimited" : "failed") : "sent");
  }
  return { state, resend };
}

function ResendOutcome({ state }: { state: ResendState }) {
  const t = useTranslations("Auth");
  if (state === "sent") return <span role="status"> {t("resent")}</span>;
  if (state === "failed") return <span role="alert"> {t("resendFailed")}</span>;
  if (state === "rateLimited") return <span role="alert"> {t("rateLimited")}</span>;
  return null;
}

function ResendVerificationButton({ email }: { email: string }) {
  const t = useTranslations("Auth");
  const { state, resend } = useResendVerification();
  return (
    <p>
      <button type="button" onClick={() => resend(email)} disabled={state === "sending"}>
        {state === "sending" ? t("resending") : t("resend")}
      </button>
      <ResendOutcome state={state} />
    </p>
  );
}

/** Email field plus resend, for /verify-email when a link has expired or does not work. */
export function ResendVerificationForm() {
  const t = useTranslations("Auth");
  const { state, resend } = useResendVerification();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "");
        if (email) void resend(email);
      }}
    >
      <p>
        <label>
          {t("email")} <input name="email" type="email" autoComplete="email" required />
        </label>
      </p>
      <p>
        <button type="submit" disabled={state === "sending"}>
          {state === "sending" ? t("resending") : t("resend")}
        </button>
        <ResendOutcome state={state} />
      </p>
    </form>
  );
}

type RequestState = "idle" | "sending" | "sent" | "failed" | "rateLimited";

/** Asks for a password reset link. The answer never says whether the address has an account. */
export function ResetPasswordRequestForm() {
  const t = useTranslations("Auth");
  const [state, setState] = useState<RequestState>("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setState("sending");
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: RESET_PASSWORD_PAGE,
    });
    setState(error ? (error.status === 429 ? "rateLimited" : "failed") : "sent");
  }

  if (state === "sent") return <p role="status">{t("resetLinkSent")}</p>;
  return (
    <form onSubmit={onSubmit}>
      <p>
        <label>
          {t("email")} <input name="email" type="email" autoComplete="email" required />
        </label>
      </p>
      {state === "failed" ? <p role="alert">{t("resetLinkFailed")}</p> : null}
      {state === "rateLimited" ? <p role="alert">{t("rateLimited")}</p> : null}
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? t("sendingResetLink") : t("sendResetLink")}
      </button>
    </form>
  );
}

/** Sets a new password from a reset link. Better Auth revokes every session of that user. */
export function SetNewPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done" | "failed">("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get("password") ?? "");
    setState("saving");
    const { error } = await authClient.resetPassword({ newPassword, token });
    setState(error ? "failed" : "done");
  }

  if (state === "done") {
    return (
      <section aria-live="polite">
        <h2>{t("resetDoneHeading")}</h2>
        <p>{t("resetDone")}</p>
        <p>
          <button type="button" onClick={() => router.push("/sign-in")}>
            {t("signIn")}
          </button>
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <p>
        <label>
          {t("newPassword")}{" "}
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <small> {t("passwordHint")}</small>
      </p>
      {state === "failed" ? <p role="alert">{t("resetLinkInvalid")}</p> : null}
      <button type="submit" disabled={state === "saving"}>
        {state === "saving" ? t("savingNewPassword") : t("setNewPassword")}
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
