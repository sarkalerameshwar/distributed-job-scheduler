import { FormEvent, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../stores/auth";
import { ApiRequestError } from "../services/api";
import { ThemeToggle } from "../components/ThemeToggle";

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
    <AuthShell title="Sign in" subtitle="Access your organization queues and workers.">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
        {error ? <p className="text-sm text-signal-danger">{error}</p> : null}
        <button type="submit" disabled={pending} className="btn-primary w-full py-2.5">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-steel">
        No account?{" "}
        <Link className="link" to="/register">
          Create one
        </Link>
      </p>
    </AuthShell>
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
    <AuthShell
      title="Create account"
      subtitle="Passwords need 10+ characters with upper, lower, and a number."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
        {error ? <p className="text-sm text-signal-danger">{error}</p> : null}
        <button type="submit" disabled={pending} className="btn-primary w-full py-2.5">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-steel">
        Already registered?{" "}
        <Link className="link" to="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell(props: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-md flex-col justify-center animate-rise py-8">
      <div className="absolute right-0 top-0">
        <ThemeToggle />
      </div>
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-xs font-extrabold text-canvas">
          DJS
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Job Scheduler</p>
          <p className="text-xs text-steel">Distributed operations console</p>
        </div>
      </div>
      <div className="panel p-6 sm:p-8">
        <h1 className="text-xl font-bold tracking-tight text-ink">{props.title}</h1>
        <p className="mt-1.5 text-sm text-steel">{props.subtitle}</p>
        <div className="mt-6">{props.children}</div>
      </div>
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
    <label className="block text-sm font-semibold text-ink">
      {props.label}
      <input
        className="field mt-1.5 font-normal"
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        required
      />
    </label>
  );
}
