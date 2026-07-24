import { useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrore("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setErrore(error.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-card border border-black/[.04] bg-surface p-8 shadow-card">
        <div className="mb-6 flex items-center gap-2 font-display text-lg font-extrabold">
          <span className="h-[9px] w-[9px] rounded-full bg-accent" />
          Budgeting
        </div>
        <label className="mb-4 block text-sm font-semibold text-ink">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-chip border border-line px-3 py-2 text-sm font-normal outline-none focus:border-accent"
          />
        </label>
        <label className="mb-5 block text-sm font-semibold text-ink">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-chip border border-line px-3 py-2 text-sm font-normal outline-none focus:border-accent"
          />
        </label>
        {errore && <p className="mb-4 text-sm font-medium text-neg">{errore}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-chip bg-hero py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
        >
          {loading ? "Accesso..." : "Accedi"}
        </button>
      </form>
    </div>
  );
}
