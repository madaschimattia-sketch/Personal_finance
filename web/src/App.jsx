import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase.js";
import { FiltersProvider } from "./context/FiltersContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import FilterBar from "./components/FilterBar.jsx";
import { ChatIcon } from "./components/Icons.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Portafoglio from "./pages/Portafoglio.jsx";
import Utenze from "./pages/Utenze.jsx";
import Budget from "./pages/Budget.jsx";
import Proiezioni from "./pages/Proiezioni.jsx";
import Fiscale from "./pages/Fiscale.jsx";
import Chat from "./pages/Chat.jsx";

export default function App() {
  const [session, setSession] = useState(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Login />;

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <FiltersProvider>
      <div className="min-h-screen bg-bg lg:flex">
        <Sidebar email={session.user.email} onLogout={handleLogout} />
        <main className="relative flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10 lg:pt-7">
          <FilterBar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portafoglio" element={<Portafoglio />} />
            <Route path="/utenze" element={<Utenze />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/proiezioni" element={<Proiezioni />} />
            <Route path="/fiscale" element={<Fiscale />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
          <a
            href="/chat"
            className="fixed bottom-20 right-5 z-10 hidden h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg lg:right-8 lg:bottom-8 lg:flex"
            aria-label="Apri assistente"
          >
            <ChatIcon className="h-[22px] w-[22px]" />
          </a>
        </main>
      </div>
    </FiltersProvider>
  );
}
