/**
 * Force a real file download from any URL — including cross-origin
 * URLs the HTML `<a download>` attribute silently ignores.
 *
 * Why this exists:
 *   UploadThing (and most public-CDN object stores) serve assets with
 *   `Content-Disposition: inline` so they render in a browser tab on
 *   direct navigation. The HTML `download` attribute is meant to flip
 *   that — but the spec ignores it whenever the link points at a
 *   different origin than the page, "as a security precaution". Net
 *   effect: `<a href={presignedUrl} download={name}>` opens the image
 *   in a new tab instead of downloading. Standard cross-origin Gotcha.
 *
 * The workaround is industry-standard: fetch the bytes ourselves
 * (CORS-allowed by UploadThing's CDN), turn them into a blob URL on
 * the same origin as the page, then trigger a download on a temporary
 * in-memory anchor. The browser respects `download` on same-origin
 * blob URLs.
 *
 * Trade-off vs the broken-but-cheap `<a download>`:
 *   - The whole file streams through the browser tab before save
 *     (no streamed-to-disk save dialog mid-fetch). Fine at our file
 *     sizes (typical generated image = ~300 kB).
 *   - Requires the storage origin to allow CORS GET. UploadThing's
 *     CDN does by default; R2 needs the bucket CORS rule, which we
 *     already set for the upload flow.
 *
 * Errors fall back to opening the URL in a new tab so the user at
 * least sees the file even when the fetch fails.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`download fetch failed: ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Defer revoke past the synchronous click handler so older browsers
    // don't cancel the download.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (e) {
    // Fallback — opens the file in a new tab so the user can right-
    // click-save manually.
    // eslint-disable-next-line no-console
    console.warn('downloadFile fallback (opening in new tab):', e);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
