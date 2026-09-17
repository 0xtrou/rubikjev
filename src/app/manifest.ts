import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jev Solves The Cube",
    short_name: "JevCube",
    description:
      "Scramble a Rubik's cube like a menace and watch Jev, the in-house AI solver, judge and solve it live — meme tiers, XP, badges and token-metered runs.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a12",
    theme_color: "#0a0a12",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
