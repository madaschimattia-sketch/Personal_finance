export default function Card({ children, className = "" }) {
  return (
    <div className={`rounded-card border border-black/[.04] bg-surface p-5 shadow-card ${className}`}>
      {children}
    </div>
  );
}
