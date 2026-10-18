import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/core/site.ts";

/** Lets phones save the site to the home screen with its name and icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fine Print",
    short_name: "Fine Print",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "browser",
    background_color: "#fbfaf6",
    theme_color: "#fbfaf6",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
