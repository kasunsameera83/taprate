export function SettingsSection({
  title,
  description,
  danger = false,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const id = `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={`panel p-5 sm:p-6 ${danger ? "border-[#f0c5c5]" : ""}`}>
      <h2 id={id} className={`text-lg font-semibold ${danger ? "text-neg-text" : ""}`}>
        {title}
      </h2>
      {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
