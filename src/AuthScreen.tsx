import { useState, type FormEvent } from "react";

type AuthScreenProps = {
  busy: boolean;
  error: string | null;
  configured: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onCreateAccount: (email: string, password: string) => Promise<void>;
};

export function AuthScreen({ busy, error, configured, onSignIn, onCreateAccount }: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submitSignIn = (event: FormEvent) => {
    event.preventDefault();
    void onSignIn(email, password);
  };

  return (
    <main className="app">
      <h1>Sales Call AI Assistant</h1>
      <p>Sign in with your email to continue.</p>

      <form className="auth-form" onSubmit={submitSignIn} aria-label="Sign in">
        <label className="auth-field">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
            required
          />
        </label>

        <label className="auth-field">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            required
          />
        </label>

        <div className="recorder-actions">
          <button type="submit" disabled={busy}>
            Sign In
          </button>
          <button type="button" disabled={busy} onClick={() => void onCreateAccount(email, password)}>
            Create Account
          </button>
        </div>
      </form>

      {!configured ? (
        <p className="recorder-error" role="alert">
          Firebase is not configured. Add the VITE_FIREBASE_* values to your local .env and restart the app.
        </p>
      ) : null}

      {error ? (
        <p className="recorder-error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
