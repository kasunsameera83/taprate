"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { canPerform, isRole, type Role } from "@/lib/security/authz";
import { LoadError } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { IconDownload } from "@/components/icons";
import { PageLoader } from "@/components/FaceLoader";
import { DoNotEmail } from "../business/DoNotEmail";
import { OwnDomain } from "../business/OwnDomain";
import { SurveyDomain } from "../business/SurveyDomain";
import { DeleteAccount, EraseCustomer, Leave } from "../business/Danger";

// Things most businesses never need: own domains, the do-not-email list, data export, privacy requests,
// developer tools and the danger zone. Every action is still checked on the server for the user's role.

type Me = { account: { name: string; role: string } | null };

export default function AdvancedSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => {
    setLoadError("");
    api<Me>("/api/account").then((r) => (r.ok ? setMe(r.data) : setLoadError(r.message)));
  }, []);
  useEffect(load, [load]);

  if (loadError) return <LoadError message={loadError} onRetry={load} />;
  if (!me?.account) return <PageLoader className="h-72" />;
  const a = me.account;
  const role: Role | null = isRole(a.role) ? a.role : null;
  const dev = [
    ...(canPerform(role, "apikeys:manage") ? [{ href: "/app/settings/api", title: "API keys", body: "Connect your own systems to TapTruly." }] : []),
    ...(canPerform(role, "audit:read") ? [{ href: "/app/settings/activity", title: "Activity log", body: "Who changed what, and when." }] : []),
  ];

  return (
    <div className="space-y-6">
      {canPerform(role, "sends:write") && <OwnDomain canChange={canPerform(role, "account:write")} />}

      {canPerform(role, "sends:write") && <SurveyDomain canChange={canPerform(role, "account:write")} />}

      {canPerform(role, "sends:write") && <DoNotEmail />}

      {canPerform(role, "account:export") && (
        <SettingsSection title="Download all your data" description="Everything for this business (surveys, ratings, comments and team) in one file you can keep or move to another tool.">
          <a className="btn btn-secondary" href="/api/account/export">
            <IconDownload className="h-4 w-4" />
            Download my data
          </a>
        </SettingsSection>
      )}

      {dev.length > 0 && (
        <SettingsSection title="For developers and auditors">
          <ul className="grid gap-3 sm:grid-cols-2">
            {dev.map((d) => (
              <li key={d.href}>
                <Link href={d.href} className="block rounded-[12px] border border-line p-4 hover:bg-canvas">
                  <span className="block font-semibold">{d.title}</span>
                  <span className="block text-sm text-muted">{d.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}

      {canPerform(role, "privacy:erase") && <EraseCustomer />}

      <Leave name={a.name} />

      {canPerform(role, "account:delete") && <DeleteAccount name={a.name} />}
    </div>
  );
}
