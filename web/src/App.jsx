import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase.js";
import { FiltersProvider } from "./context/FiltersContext.jsx";
import { SEZIONE_INVESTIMENTI, SEZIONE_SPESE_RICORRENTI } from "./lib/nav.js";
import Sidebar from "./components/Sidebar.jsx";
import FilterBar from "./components/FilterBar.jsx";
import SectionLayout from "./components/SectionLayout.jsx";
import { ChatIcon } from "./components/Icons.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Portafoglio from "./pages/investimenti/Portafoglio.jsx";
import FondiPensione from "./pages/investimenti/FondiPensione.jsx";
import Fiscale from "./pages/investimenti/Fiscale.jsx";
import Casa from "./pages/spese-ricorrenti/Casa.jsx";
import Veicolo from "./pages/spese-ricorrenti/Veicolo.jsx";
import Persona from "./pages/spese-ricorrenti/Persona.jsx";
import Budget from "./pages/Budget.jsx";
import Proiezioni from "./pages/Proiezioni.jsx";
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

            <Route path="/investimenti" element={<SectionLayout voci={SEZIONE_INVESTIMENTI.voci} />}>
              <Route index element={<Navigate to="portafoglio" replace />} />
              <Route path="portafoglio" element={<Portafoglio />} />
              <Route path="fondi-pensione" element={<FondiPensione />} />
              <Route path="fiscale" element={<Fiscale />} />
            </Route>

            <Route path="/spese-ricorrenti" element={<SectionLayout voci={SEZIONE_SPESE_RICORRENTI.voci} />}>
              <Route index element={<Navigate to="casa" replace />} />
              <Route path="casa" element={<Casa />} />
              <Route path="veicolo" element={<Veicolo />} />
              <Route path="persona" element={<Persona />} />
            </Route>

            <Route path="/budget" element={<Budget />} />
            <Route path="/proiezioni" element={<Proiezioni />} />
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
