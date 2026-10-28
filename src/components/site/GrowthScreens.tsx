// Product pictures for the newer features: winning customers back, and phone alerts. Pure CSS loops
// (see .lp-seq in globals.css); with reduced motion everything is simply shown, still.
import { AppWindow } from "./Screens";

const seq = (i: number) => ({ animationDelay: `${i * 1.1}s` });

/** Unhappy rating → follow-up resolved → "how are we now?" email → happy rating, "Won back". */
export function RecoveryScreen() {
  return (
    <AppWindow
      title="Follow-ups"
      label="A customer rated Very poor because their parcel arrived damaged. The team sent a refund and resolved it, TapTruly emailed the customer to ask again, and they rated Excellent: won back."
    >
      <div className="space-y-2.5 p-5">
        <div className="lp-seq flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5" style={seq(0)}>
          <span className="text-[22px]">😞</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">Very poor <span className="font-normal text-muted">from kasun@…</span></p>
            <p className="truncate text-[12px] text-muted">&ldquo;Parcel arrived damaged&rdquo;</p>
          </div>
          <span className="shrink-0 rounded-full bg-neg-soft px-2.5 py-1 text-[11px] font-bold text-neg-text">Follow-up</span>
        </div>
        <div className="lp-seq flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5" style={seq(1)}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">NP</span>
          <p className="min-w-0 flex-1 truncate text-[13px]">Called back, new parcel sent</p>
          <span className="shrink-0 rounded-full bg-pos-soft px-2.5 py-1 text-[11px] font-bold text-pos-text">Resolved</span>
        </div>
        <div className="lp-seq rounded-[10px] border border-dashed border-line bg-[#f8fafc] px-3 py-2.5" style={seq(2)}>
          <p className="text-[12px] text-muted">Email sent for you</p>
          <p className="text-[13px] font-semibold">Did we put it right?</p>
          <div className="mt-1.5 flex gap-1" aria-hidden>
            {["😡", "🙁", "😐", "🙂", "😍"].map((f) => (
              <span key={f} className="flex h-7 w-8 items-center justify-center rounded-[6px] border border-line bg-white text-[14px]">
                {f}
              </span>
            ))}
          </div>
        </div>
        <div className="lp-seq flex items-center gap-3 rounded-[10px] border border-pos-fill bg-pos-soft px-3 py-2.5" style={seq(3)}>
          <span className="lp-pop text-[22px]">😍</span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">Excellent <span className="font-normal text-muted">from kasun@…</span></p>
          <span className="shrink-0 rounded-full bg-pos-fill px-2.5 py-1 text-[11px] font-bold text-white">Won back</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[12px] font-semibold text-muted">Won back this month</span>
          <span className="font-display text-[26px] font-bold leading-none tabular">23</span>
        </div>
      </div>
    </AppWindow>
  );
}

/** A phone lock screen with alerts arriving one by one. */
export function AlertsScreen() {
  const alerts = [
    { icon: "😞", time: "now", title: "Unhappy rating · Kandy branch", body: "“Waited 40 minutes at the counter”" },
    { icon: "📉", time: "9:00", title: "Satisfaction dropped at Galle", body: "78% this week, down from 91% last week." },
    { icon: "🎉", time: "1h", title: "Won back", body: "Dilani rated Excellent after your call." },
  ];
  return (
    <div
      role="img"
      aria-label="Phone alerts from TapTruly: an unhappy rating at the Kandy branch, a warning that satisfaction dropped at the Galle branch this week, and a customer won back."
      className="mx-auto w-full max-w-[300px] rounded-[38px] border-[6px] border-ink bg-[linear-gradient(160deg,#4f46e5,#1e1b4b)] p-3 shadow-[0_30px_60px_-30px_rgba(16,21,61,0.6)]"
    >
      <div aria-hidden>
        <div className="mx-auto mb-5 mt-1 h-5 w-24 rounded-full bg-ink" />
        <p className="text-center font-display text-[46px] font-bold leading-none text-white tabular">9:41</p>
        <p className="mb-6 mt-1 text-center text-[12px] text-white/70">Wednesday</p>
        <div className="space-y-2 pb-6">
          {alerts.map((a, i) => (
            <div key={a.title} className="lp-seq lp-drop rounded-[16px] bg-white/90 px-3 py-2.5 backdrop-blur" style={seq(i)}>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-muted">
                <span>TapTruly</span>
                <span className="normal-case">{a.time}</span>
              </div>
              <p className="mt-0.5 text-[13px] font-semibold text-ink">
                <span className="mr-1">{a.icon}</span>
                {a.title}
              </p>
              <p className="truncate text-[12px] text-ink/70">{a.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A helpdesk ticket with TapTruly's private note, and the tools it connects to. */
export function HelpdeskScreen() {
  const tools = ["Zendesk", "Freshdesk", "Gorgias", "Intercom", "Front", "Help Scout", "HubSpot", "Shopify", "Slack", "Teams"];
  return (
    <AppWindow
      title="Ticket #1087 · Your helpdesk"
      label="A helpdesk ticket where TapTruly has added a private note: the customer rated this ticket Poor and added a comment. Below, the tools TapTruly connects to: Zendesk, Freshdesk, Gorgias, Intercom, Front, Help Scout, HubSpot, Shopify, Slack and Teams."
    >
      <div className="space-y-2.5 p-5">
        <div className="rounded-[10px] border border-line px-3 py-2.5">
          <p className="text-[12px] text-muted">Nimal (agent) · 10:12</p>
          <p className="text-[13px]">Your refund is on its way. Sorry again for the delay!</p>
        </div>
        <div className="lp-seq rounded-[10px] border border-[#f3d27a] bg-[#fff8e6] px-3 py-2.5" style={{ animationDelay: "0.4s" }}>
          <p className="flex items-center justify-between text-[12px] font-semibold text-[#8a6100]">
            <span>Private note · TapTruly</span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px]">Only your team sees this</span>
          </p>
          <p className="mt-1 text-[13px]">🔴 The customer rated this ticket <strong>Poor (2)</strong> for Nimal.</p>
          <p className="mt-0.5 text-[12px] text-muted">&ldquo;Took three days to hear back.&rdquo;</p>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tools.map((t, i) => (
            <span key={t} className="lp-chip rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold" style={{ animationDelay: `${i * 0.25}s` }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}
