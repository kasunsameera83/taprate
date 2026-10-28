import { requirePageSession } from "@/lib/session";
import { canPerform } from "@/lib/security/authz";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { active } = await requirePageSession({ needAccount: true });
  const role = active!.role;
  const tabs = [
    { href: "/app/settings", label: "Your account" },
    ...(canPerform(role, "team:read") ? [{ href: "/app/settings/team", label: "Team" }] : []),
    { href: "/app/settings/business", label: "Business" },
    { href: "/app/settings/locations", label: "Branches" },
    ...(canPerform(role, "billing:manage") ? [{ href: "/app/settings/billing", label: "Billing" }] : []),
    ...(canPerform(role, "integrations:read") ? [{ href: "/app/settings/integrations", label: "Integrations" }] : []),
    ...(canPerform(role, "apikeys:manage") ? [{ href: "/app/settings/api", label: "API" }] : []),
    ...(canPerform(role, "audit:read") ? [{ href: "/app/settings/activity", label: "Activity" }] : []),
  ];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] font-bold leading-tight">Settings</h1>
        <p className="text-sm text-muted">Your sign-in, your team and your business.</p>
      </header>
      <SettingsTabs tabs={tabs} />
      <div className="max-w-3xl">{children}</div>
    </div>
  );
}
