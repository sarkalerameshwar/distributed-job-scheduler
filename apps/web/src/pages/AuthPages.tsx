import { FormEvent, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../stores/auth";
import { ApiRequestError } from "../services/api";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("admin@scheduler.local");
  const [password, setPassword] = useState("Admin123!Dev");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password);
      navigate(location.state?.from ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Use your scheduler account. Seeded admin is pre-filled for local development.">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">
        No account?{" "}
        <Link className="text-cyan-400 hover:text-cyan-300" to="/register">
          Register
        </Link>
      </p>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await register({ name, email, password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Registration failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Password must be at least 10 characters and include upper, lower, and a number."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">
        Already registered?{" "}
        <Link className="text-cyan-400 hover:text-cyan-300" to="/login">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

function AuthCard(props: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-white">{props.title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">{props.subtitle}</p>
      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6">{props.children}</div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm text-slate-300">
      {props.label}
      <input
        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        required
      />
    </label>
  );
}
