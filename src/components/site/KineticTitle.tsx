// The hero headline rises in word by word, once, as the page loads (pure CSS; nothing moves with
// reduced motion). The words stay real text, so search engines and screen readers read it normally.
export function KineticTitle({ text, className }: { text: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <h1 className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="kt-word">
            <span className="kt-inner" style={{ animationDelay: `${120 + i * 75}ms` }}>
              {w}
            </span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </h1>
  );
}

/** Follows the headline in, as part of the same opening moment. */
export function Reveal({ delay, children, className = "" }: { delay: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={`kt-fade ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
