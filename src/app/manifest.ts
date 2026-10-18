import type { MetadataRoute } from "next";

/** Lets Chrome/Edge "Install" Claude Tree as its own app window with a taskbar/dock icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Claude Tree",
    short_name: "Claude Tree",
    description: "Turn long Claude chats into a navigable topic tree",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#c2410c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
