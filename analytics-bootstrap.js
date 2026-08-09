/**
 * Vercel Web Analytics bootstrap for this static site.
 *
 * Next.js apps use:
 *   import { Analytics } from "@vercel/analytics/next"
 *   <Analytics />
 *
 * This project is plain HTML + app.js, so we use inject() instead.
 */
import { inject, track } from "@vercel/analytics";

inject();

// Expose for custom events from app.js (bookings, try-on, shop, CTAs)
window.vercelTrack = track;
