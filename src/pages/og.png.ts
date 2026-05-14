import type { APIRoute } from "astro";
import { generateOgImageForSite } from "@/utils/generateOgImages";

export const GET: APIRoute = async () => {
  try {
    const buffer = await generateOgImageForSite();
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png" },
    });
  } catch (e) {
    // Fallback: return a simple 1x1 transparent PNG if font loading fails
    const fallback = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB4jG6GQAAAABJRU5ErkJggg==",
        "base64"
      )
    );
    return new Response(fallback, {
      headers: { "Content-Type": "image/png" },
    });
  }
};
