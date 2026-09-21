"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowMark } from "@/components/auth";
import styles from "@/components/auth/auth.module.css";
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
 *
 * Drawn as the rest of the world draws a form: a label in heavy ink over a fully-rounded white
 * pill input, one filled black pill to act with, and anything that went wrong stated above the
 * button in a tinted block that is announced. Every field has a real `<label for>`, and a field a
 * failure is about is marked `aria-invalid` and pointed at its message with `aria-describedby`, so
 * the error is not carried by a red edge alone.
 */
export function AuthForm({
  mode,
  children,
}: {
  mode: "sign-in" | "sign-up";
  /**
   * The other ways in, drawn under the form inside the same card. A slot rather than markup on the
   * page, because once the next step is in the inbox they are wrong: nobody who has just created an
   * account wants "continue without an account" underneath the sentence telling them to open it.
   */
  children?: ReactNode;
}) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  // Set when the next step is in the inbox: after sign-up, or a sign-in refused as unverified.
  const [awaiting, setAwaiting] = useState<{ email: string; reason: "signedUp" | "unverified" }>();

  const emailId = useId();
  const passwordId = useId();
  const hintId = useId();
  const failureId = useId();

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
      <section className={styles.form} aria-live="polite">
        <h2 className={styles.cardTitle}>
          {awaiting.reason === "signedUp" ? t("checkEmailHeading") : t("notVerifiedHeading")}
        </h2>
        <p className={styles.cardBody}>
          {awaiting.reason === "signedUp"
            ? t("checkEmail", { email: awaiting.email })
            : t("notVerified")}
        </p>
        <ResendVerificationButton email={awaiting.email} />
      </section>
    );
  }

  return (
    <>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={emailId}>
            {t("email")}
          </label>
          <input
            id={emailId}
            className={styles.input}
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={failure !== null || undefined}
            aria-describedby={failure ? failureId : undefined}
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={passwordId}>
            {t("password")}
          </label>
          <input
            id={passwordId}
            className={styles.input}
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            minLength={8}
            aria-invalid={failure !== null || undefined}
            aria-describedby={
              [mode === "sign-up" ? hintId : null, failure ? failureId : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
            required
          />
          {mode === "sign-up" ? (
            <p id={hintId} className={styles.hint}>
              {t("passwordHint")}
            </p>
          ) : null}
        </div>

        {failure ? (
          <p id={failureId} className={styles.alert} role="alert">
            {t(failure)}
          </p>
        ) : null}

        <button type="submit" className={styles.primary} disabled={pending}>
          {mode === "sign-up"
            ? pending
              ? t("signingUp")
              : t("signUp")
            : pending
              ? t("signingIn")
              : t("signIn")}
          {pending ? null : <ArrowMark className={styles.arrow} />}
        </button>
      </form>

      {children}
    </>
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
  if (state === "sent")
    return (
      <p className={styles.status} role="status">
        {t("resent")}
      </p>
    );
  if (state === "failed")
    return (
      <p className={styles.alert} role="alert">
        {t("resendFailed")}
      </p>
    );
  if (state === "rateLimited")
    return (
      <p className={styles.alert} role="alert">
        {t("rateLimited")}
      </p>
    );
  return null;
}

function ResendVerificationButton({ email }: { email: string }) {
  const t = useTranslations("Auth");
  const { state, resend } = useResendVerification();
  return (
    <div className={styles.actions}>
      <ResendOutcome state={state} />
      <button
        type="button"
        className={styles.secondary}
        onClick={() => resend(email)}
        disabled={state === "sending"}
      >
        {state === "sending" ? t("resending") : t("resend")}
      </button>
    </div>
  );
}

/** Email field plus resend, for /verify-email when a link has expired or does not work. */
export function ResendVerificationForm() {
  const t = useTranslations("Auth");
  const { state, resend } = useResendVerification();
  const emailId = useId();
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "");
        if (email) void resend(email);
      }}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor={emailId}>
          {t("email")}
        </label>
        <input
          id={emailId}
          className={styles.input}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <ResendOutcome state={state} />
      <button type="submit" className={styles.primary} disabled={state === "sending"}>
        {state === "sending" ? t("resending") : t("resend")}
        {state === "sending" ? null : <ArrowMark className={styles.arrow} />}
      </button>
    </form>
  );
}

type RequestState = "idle" | "sending" | "sent" | "failed" | "rateLimited";

/** Asks for a password reset link. The answer never says whether the address has an account. */
export function ResetPasswordRequestForm() {
  const t = useTranslations("Auth");
  const [state, setState] = useState<RequestState>("idle");
  const emailId = useId();
  const failureId = useId();

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

  if (state === "sent")
    return (
      <p className={styles.status} role="status">
        {t("resetLinkSent")}
      </p>
    );

  const failed = state === "failed" || state === "rateLimited";
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={emailId}>
          {t("email")}
        </label>
        <input
          id={emailId}
          className={styles.input}
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={failed || undefined}
          aria-describedby={failed ? failureId : undefined}
          required
        />
      </div>
      {failed ? (
        <p id={failureId} className={styles.alert} role="alert">
          {state === "rateLimited" ? t("rateLimited") : t("resetLinkFailed")}
        </p>
      ) : null}
      <button type="submit" className={styles.primary} disabled={state === "sending"}>
        {state === "sending" ? t("sendingResetLink") : t("sendResetLink")}
        {state === "sending" ? null : <ArrowMark className={styles.arrow} />}
      </button>
    </form>
  );
}

/** Sets a new password from a reset link. Better Auth revokes every session of that user. */
export function SetNewPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done" | "failed">("idle");
  const passwordId = useId();
  const hintId = useId();
  const failureId = useId();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get("password") ?? "");
    setState("saving");
    const { error } = await authClient.resetPassword({ newPassword, token });
    setState(error ? "failed" : "done");
  }

  if (state === "done") {
    return (
      <section className={styles.form} aria-live="polite">
        <h2 className={styles.cardTitle}>{t("resetDoneHeading")}</h2>
        <p className={styles.cardBody}>{t("resetDone")}</p>
        <button type="button" className={styles.primary} onClick={() => router.push("/sign-in")}>
          {t("signIn")}
          <ArrowMark className={styles.arrow} />
        </button>
      </section>
    );
  }

  const failed = state === "failed";
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={passwordId}>
          {t("newPassword")}
        </label>
        <input
          id={passwordId}
          className={styles.input}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          aria-invalid={failed || undefined}
          aria-describedby={[hintId, failed ? failureId : null].filter(Boolean).join(" ")}
          required
        />
        <p id={hintId} className={styles.hint}>
          {t("passwordHint")}
        </p>
      </div>
      {failed ? (
        <p id={failureId} className={styles.alert} role="alert">
          {t("resetLinkInvalid")}
        </p>
      ) : null}
      <button type="submit" className={styles.primary} disabled={state === "saving"}>
        {state === "saving" ? t("savingNewPassword") : t("setNewPassword")}
        {state === "saving" ? null : <ArrowMark className={styles.arrow} />}
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
    <div className={styles.actions}>
      {failure ? (
        <p className={styles.alert} role="alert">
          {t(failure)}
        </p>
      ) : null}
      <button type="button" className={styles.secondary} onClick={onClick} disabled={pending}>
        {pending ? t("startingAnonymous") : t("continueAnonymously")}
      </button>
      <p className={styles.hint}>{t("anonymousHelp")}</p>
    </div>
  );
}

export function SignOutButton() {
  const t = useTranslations("Auth");
  const router = useRouter();
  return (
    <button
      type="button"
      className={styles.secondary}
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
