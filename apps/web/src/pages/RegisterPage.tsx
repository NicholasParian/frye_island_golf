import { type FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function RegisterPage() {
  const { user, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await register(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card stack auth-card">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <p className="page-head__eyebrow">Join the tee sheet</p>
          <h2 className="page-head__title">Create account</h2>
          <p className="page-head__lede muted" style={{ fontSize: "0.95rem" }}>
            After signup, an administrator can mark your account as a member when
            appropriate.
          </p>
        </div>
        <form className="stack" onSubmit={(e) => void onSubmit(e)}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password (min 8 characters)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Register"}
          </button>
        </form>
        <p className="muted" style={{ margin: 0, textAlign: "center" }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
