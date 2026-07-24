// Assistente chat (Fase 5 — ESPERTO DI FINANZA, blocco 1). Un'unica conversazione
// continua (riprende l'ultima esistente all'apertura); "Nuova conversazione" ne
// azzera il contesto lato client (l'edge function ne crea una nuova al primo invio).
let chatConversazioneId = null;

function renderMessaggioChat(ruolo, testo) {
  const div = document.createElement("div");
  div.className = `chat-bolla chat-${ruolo}`;
  div.textContent = testo;
  document.getElementById("chat-messaggi").appendChild(div);
  div.scrollIntoView({ block: "end" });
}

async function caricaStoricoChat() {
  const contenitore = document.getElementById("chat-messaggi");
  contenitore.innerHTML = "";
  const { data: conv } = await supabaseClient.from("chat_conversazioni")
    .select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv) {
    chatConversazioneId = null;
    return;
  }
  chatConversazioneId = conv.id;
  const { data: messaggi } = await supabaseClient.from("chat_messaggi")
    .select("ruolo, contenuto").eq("conversazione_id", conv.id).order("created_at", { ascending: true });
  for (const m of messaggi ?? []) renderMessaggioChat(m.ruolo, m.contenuto);
}

async function initChat() {
  await caricaStoricoChat();

  document.getElementById("btn-chat-nuova").addEventListener("click", () => {
    chatConversazioneId = null;
    document.getElementById("chat-messaggi").innerHTML = "";
  });

  const form = document.getElementById("form-chat");
  const input = document.getElementById("chat-input");
  const erroreEl = document.getElementById("chat-errore");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const testo = input.value.trim();
    if (!testo) return;
    erroreEl.textContent = "";
    input.value = "";
    input.disabled = true;
    renderMessaggioChat("user", testo);

    try {
      const data = await invokeFunction("chat-assistente", { messaggio: testo, conversazione_id: chatConversazioneId });
      chatConversazioneId = data.conversazione_id;
      renderMessaggioChat("assistant", data.risposta);
    } catch (err) {
      erroreEl.textContent = err.message;
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}
