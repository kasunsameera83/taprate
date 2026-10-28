import type { MetadataRoute } from "next";

// Lets people install TapTruly on their phone or computer (and is required for alerts on iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TapTruly",
    short_name: "TapTruly",
    description: "One-click customer feedback.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
