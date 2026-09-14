/**
 * BookUp — App & Public URL Resolution Utility
 * Reads VITE_APP_URL environment variable if set,
 * or falls back to production URL https://bookup-in.vercel.app.
 */

export const DEFAULT_APP_URL = 'https://bookup-in.vercel.app';

/**
 * Returns the resolved base application URL (e.g. "https://bookup-in.vercel.app").
 * Priority:
 * 1. import.meta.env.VITE_APP_URL (if defined and non-empty)
 * 2. DEFAULT_APP_URL ("https://bookup-in.vercel.app")
 */
export function getAppBaseUrl() {
  let envUrl = '';
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) {
      envUrl = import.meta.env.VITE_APP_URL;
    } else if (typeof process !== 'undefined' && process.env?.VITE_APP_URL) {
      envUrl = process.env.VITE_APP_URL;
    }
  } catch (_e) {}

  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return DEFAULT_APP_URL;
}

/**
 * Returns the full absolute public booking URL for a provider slug.
 * e.g. "https://bookup-in.vercel.app/book/yourslovely"
 */
export function getBookingUrl(slug) {
  const base = getAppBaseUrl();
  const cleanSlug = slug ? encodeURIComponent(slug) : 'my-page';
  return `${base}/book/${cleanSlug}`;
}

/**
 * Returns the display version of booking URL without protocol.
 * e.g. "bookup-in.vercel.app/book/yourslovely"
 */
export function getBookingDisplayUrl(slug) {
  const full = getBookingUrl(slug);
  return full.replace(/^https?:\/\//, '');
}

/**
 * Returns the customer management URL for a raw token.
 * e.g. "https://bookup-in.vercel.app/manage/c8a9f..."
 */
export function getCustomerManagementUrl(token) {
  const base = getAppBaseUrl();
  return `${base}/manage/${encodeURIComponent(token || '')}`;
}
