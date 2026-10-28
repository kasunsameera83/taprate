"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { inviteCreateSchema, memberUpdateSchema, fieldErrors } from "@/lib/validation/schemas";
import { ROLE_DESCRIPTION, ROLE_LABEL, isRole, type Role } from "@/lib/security/authz";
import { Badge, Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { IconCopy } from "@/components/icons";
import { confirmDialog } from "@/components/ConfirmDialog";

type Member = { userId: string; email: string; role: string; agentName: string | null; joinedAt: string };
type Invite = { id: string; email: string; role: string; agentName: string | null; createdAt: string; expiresAt: string };
type Team = { myRole: Role; myUserId: string; members: Member[]; invites: Invite[] };

const roleLabel = (r: string) => (isRole(r) ? ROLE_LABEL[r] : r);

/** Which roles the current user may assign (the database enforces the same rules). */
function assignable(myRole: Role, targetRole?: string): Role[] {
  if (myRole === "owner") return ["owner", "admin", "viewer", "agent"];
  if (myRole === "admin" && (!targetRole || targetRole === "viewer" || targetRole === "agent")) return ["viewer", "agent"];
  return [];
}

export default function TeamPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => {
    setLoadError("");
    api<Team>("/api/team").then((r) => (r.ok ? setTeam(r.data) : setLoadError(r.message)));
  }, []);
  useEffect(load, [load]);

  if (loadError) return <LoadError message={loadError} onRetry={load} />;
  if (!team) return <Skeleton className="h-72 w-full rounded-[var(--radius-panel)]" />;

  return (
    <div className="space-y-6">
      <InviteForm myRole={team.myRole} onInvited={load} />
      <SettingsSection title={`Members (${team.members.length})`}>
        <ul className="divide-y divide-line">
          {team.members.map((m) => (
            <MemberRow key={m.userId} member={m} myRole={team.myRole} isMe={m.userId === team.myUserId} onChanged={load} />
          ))}
        </ul>
      </SettingsSection>
      {team.invites.length > 0 && (
        <SettingsSection title={`Pending invites (${team.invites.length})`} description="Invites expire after 7 days.">
          <ul className="divide-y divide-line">
            {team.invites.map((i) => (
              <InviteRow key={i.id} invite={i} myRole={team.myRole} onChanged={load} />
            ))}
          </ul>
        </SettingsSection>
      )}
      <SettingsSection title="What each role can do">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {(["owner", "admin", "viewer", "agent"] as const).map((r) => (
            <div key={r}>
              <dt className="font-semibold">{ROLE_LABEL[r]}</dt>
              <dd className="text-muted">{ROLE_DESCRIPTION[r]}</dd>
            </div>
          ))}
        </dl>
      </SettingsSection>
    </div>
  );
}

function InviteForm({ myRole, onInvited }: { myRole: Role; onInvited: () => void }) {
  const roles = assignable(myRole).filter((r) => r !== "owner");
  const [role, setRole] = useState<Role>(roles.includes("viewer") ? "viewer" : (roles[0] ?? "viewer"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const parsed = inviteCreateSchema.safeParse({
      email: String(f.get("inviteEmail") ?? ""),
      role,
      agentName: role === "agent" ? String(f.get("agentName") ?? "") : null,
    });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      return setErrors({ inviteEmail: errs.email ?? "", agentName: errs.agentName ?? "" });
    }
    setErrors({});
    setBusy(true);
    const r = await api<{ emailSent: boolean; joinUrl: string }>("/api/team/invites", { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      formEl.reset();
      setNotice(
        r.data.emailSent
          ? { kind: "success", text: `Invite emailed to ${parsed.data.email}.` }
          : { kind: "success", text: `Invite created. Email sending isn't set up yet, so send ${parsed.data.email} this link and ask them to sign up with that email:`, link: r.data.joinUrl },
      );
      onInvited();
    } else {
      setErrors({ inviteEmail: r.fields?.email ?? "", agentName: r.fields?.agentName ?? "" });
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }

  if (roles.length === 0) return null;

  return (
    <SettingsSection title="Invite a teammate" description="They'll get an email and join once they sign in with that address.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && (
          <Notice kind={notice.kind}>
            {notice.text}
            {notice.link && (
              <span className="mt-2 flex items-center gap-2">
                <code className="break-all rounded bg-white px-1.5 py-0.5 text-[13px]">{notice.link}</code>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(notice.link!)} aria-label="Copy link">
                  <IconCopy className="h-4 w-4" />
                </button>
              </span>
            )}
          </Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="Email" name="inviteEmail" error={errors.inviteEmail || undefined}>
            <TextInput name="inviteEmail" type="email" inputMode="email" autoComplete="off" maxLength={254} error={errors.inviteEmail || undefined} />
          </Field>
          <Field label="Role" name="inviteRole">
            <select id="inviteRole" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-[13px] text-muted">{ROLE_DESCRIPTION[role]}</p>
        {role === "agent" && (
          <Field
            label="Agent name"
            name="agentName"
            error={errors.agentName || undefined}
            hint="Exactly as it appears in your helpdesk buttons (the agent merge tag). Ratings with this name are the ones they'll see."
          >
            <TextInput name="agentName" maxLength={100} error={errors.agentName || undefined} hasHint />
          </Field>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Sending invite…" : "Send invite"}
        </button>
      </form>
    </SettingsSection>
  );
}

function MemberRow({ member, myRole, isMe, onChanged }: { member: Member; myRole: Role; isMe: boolean; onChanged: () => void }) {
  const options = isMe ? [] : assignable(myRole, member.role);
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(member.role);
  const [agentName, setAgentName] = useState(member.agentName ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = memberUpdateSchema.safeParse({ role, agentName: role === "agent" ? agentName : null });
    if (!parsed.success) return setError(Object.values(fieldErrors(parsed.error))[0] ?? "Check the details");
    setBusy(true);
    const r = await api(`/api/team/members/${encodeURIComponent(member.userId)}`, { method: "PATCH", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      setError("");
      onChanged();
    } else setError(Object.values(r.fields ?? {})[0] ?? r.message);
  }

  async function remove() {
    if (!(await confirmDialog({ title: `Remove ${member.email}?`, body: "They'll lose access to this business straight away.", confirmLabel: "Remove", danger: true }))) return;
    setBusy(true);
    const r = await api(`/api/team/members/${encodeURIComponent(member.userId)}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onChanged();
    else setError(r.message);
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {member.email} {isMe && <span className="font-normal text-muted">(you)</span>}
          </p>
          <p className="text-[13px] text-muted">
            <Badge tone={member.role === "owner" ? "brand" : "plain"}>{roleLabel(member.role)}</Badge>
            {member.agentName && <span className="ml-2">Agent name: {member.agentName}</span>}
          </p>
        </div>
        {options.length > 0 && !editing && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              Change role
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
              Remove
            </button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-[10px] bg-canvas p-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Role</span>
            <select className="input min-w-36" value={role} onChange={(e) => setRole(e.target.value)}>
              {options.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          {role === "agent" && (
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Agent name</span>
              <input className="input" maxLength={100} value={agentName} onChange={(e) => setAgentName(e.target.value)} />
            </label>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
            Save
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-neg-text">{error}</p>}
    </li>
  );
}

function InviteRow({ invite, myRole, onChanged }: { invite: Invite; myRole: Role; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canRevoke = myRole === "owner" || (myRole === "admin" && invite.role !== "admin");
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{invite.email}</p>
        <p className="text-[13px] text-muted">
          {roleLabel(invite.role)}
          {invite.agentName ? ` (${invite.agentName})` : ""}, expires {new Date(invite.expiresAt).toLocaleDateString()}
        </p>
        {error && <p className="text-[13px] text-neg-text">{error}</p>}
      </div>
      {canRevoke && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await api(`/api/team/invites/${encodeURIComponent(invite.id)}`, { method: "DELETE" });
            setBusy(false);
            if (r.ok) onChanged();
            else setError(r.message);
          }}
        >
          Cancel invite
        </button>
      )}
    </li>
  );
}
