"use client";
import { TabNav } from "@/components/TabNav";

export function SettingsTabs({ tabs }: { tabs: Array<{ href: string; label: string; locked?: boolean }> }) {
  return <TabNav label="Settings" tabs={tabs} exactRoot="/app/settings" />;
}
