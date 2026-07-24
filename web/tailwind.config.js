/** Design token Bold Mono — unica fonte di verità dei colori: i componenti consumano
 * sempre questi nomi semantici, mai un hex hardcoded. Cambiare direzione visiva in
 * futuro significa modificare i valori qui, non i componenti. */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F3F4F6",
        surface: "#FFFFFF",
        ink: "#0B0C10",
        muted: "#6B7280",
        line: "#E7E8EC",
        accent: "#B4FF39",
        "accent-ink": "#0B0C10",
        hero: "#0B0C10",
        "hero-muted": "#9AA0AA",
        pos: "#3D6B0B",
        "pos-bg": "#EBFFC7",
        neg: "#FF6B57",
        "warn-bg": "#FFF1D6",
        "warn-ink": "#8A5A00",
      },
      borderRadius: {
        card: "22px",
        chip: "11px",
      },
      fontFamily: {
        display: ["ui-rounded", '"SF Pro Rounded"', "system-ui", "sans-serif"],
        body: ["-apple-system", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 28px rgba(15,23,42,.07)",
      },
    },
  },
  plugins: [],
};
