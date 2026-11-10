/**
 * The customer tracking page lives on its own path (`/track/<token>`) so a
 * customer who was sent the link never has to sign in. Everything else keeps
 * the normal workspace.
 *
 * The parsing lives here, away from the render entry, because the deploy
 * depends on it: the tracking page is only reachable when the web host serves
 * the app shell for `/track/<token>` instead of answering with a 404.
 */
export interface TrackingRoute {
  /** True when the address bar points at the customer tracking page. */
  isTracking: boolean;
  /** The link token, or null when the path carries no (valid) token. */
  token: string | null;
}

/**
 * Reads the tracking route out of a pathname.
 *
 * `/track` and `/track/<token>` open the customer page; anything else opens
 * the workspace. A malformed percent-escape must not blank the whole app, so
 * it falls back to the page without a token.
 */
export function parseTrackingRoute(pathname: string): TrackingRoute {
  if (pathname !== '/track' && !pathname.startsWith('/track/')) {
    return { isTracking: false, token: null };
  }
  try {
    return { isTracking: true, token: decodeURIComponent(pathname.slice('/track/'.length)) };
  } catch {
    // A malformed escape in the address bar must not blank the whole app.
    return { isTracking: true, token: null };
  }
}
