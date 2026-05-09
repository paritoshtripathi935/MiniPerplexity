/**
 * Strip protocol + leading `www.` from a URL, returning a clean hostname for
 * display. Falls back to the raw input on a parse failure so chips/lists never
 * render an empty string.
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
