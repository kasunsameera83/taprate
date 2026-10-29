import { visitorCountry } from "@/lib/site/geo";
import { SiteFooter } from "./SiteFooter";

/** The footer for server-rendered pages: "Made in Sri Lanka" only for visitors in Sri Lanka. */
export async function SiteFooterAuto({ tagline }: { tagline?: string }) {
  const sriLanka = (await visitorCountry()) === "LK";
  return <SiteFooter tagline={tagline} sriLanka={sriLanka} />;
}
