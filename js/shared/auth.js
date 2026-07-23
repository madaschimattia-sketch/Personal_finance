// Boot sequence + navigazione minimale (fetch dei fragment pages/*.html dentro #app,
// stesso pattern usato in LMadvisory) + login/logout Supabase Auth.

const PAGINE_AUTENTICATE = {
  home: null,
  portafoglio: initPortafoglio,
  fiscale: initFiscale,
  test: initTest,
};

async function showPage(pageId) {
  const res = await fetch(`pages/${pageId}.html`);
  document.getElementById("app").innerHTML = await res.text();
  if (pageId === "login") {
    initLogin();
    return;
  }
  initNav();
  const init = PAGINE_AUTENTICATE[pageId];
  if (init) await init();
}

function initNav() {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(el.dataset.page);
    });
  });
  supabaseClient.auth.getSession().then(({ data }) => {
    const emailEl = document.getElementById("nav-email");
    if (emailEl) emailEl.textContent = data.session?.user?.email ?? "";
  });
  const btnLogout = document.getElementById("btn-logout-nav");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      showPage("login");
    });
  }
}

function initLogin() {
  document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const erroreEl = document.getElementById("login-errore");
    erroreEl.textContent = "";
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      erroreEl.textContent = error.message;
      return;
    }
    showPage("home");
  });
}

function initTest() {
  document.getElementById("btn-invoca").addEventListener("click", async () => {
    const nome = document.getElementById("select-funzione").value;
    const outputEl = document.getElementById("output-risultato");
    outputEl.textContent = "In corso...";
    let body;
    try {
      body = JSON.parse(document.getElementById("input-body").value || "{}");
    } catch (e) {
      outputEl.textContent = `Body JSON non valido: ${e.message}`;
      return;
    }
    try {
      const data = await invokeFunction(nome, body);
      outputEl.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      outputEl.textContent = `Errore: ${e.message}`;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const { data } = await supabaseClient.auth.getSession();
  showPage(data.session ? "home" : "login");
});
