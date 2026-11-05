// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHEN SOMETHING GOES WRONG — what happened, why, do this.
 *
 * The vendored APKSoftapp client (vendor/apk-softapp/, codes from
 * contracts/problems) draws the card, with Retry where `onRetry` is given.
 * This page is also published on its own (acoustics.like.audio): without the
 * client it still says what happened, as a plain alert of the title, detail
 * and first step — never a silent failure.
 */
export function showProblem(what, opts = {}) {
  const S = globalThis.APKSoftapp;
  if (S && typeof S.showProblem === 'function') return S.showProblem(what, opts);
  const detail = opts.detail || (what && what.message) || '';
  const lines = [typeof what === 'string' ? what.replace(/_/g, ' ') : 'Something went wrong', opts.subject, detail, ...(opts.fix || [])].filter(Boolean);
  globalThis.alert?.(lines.join('\n'));
  return null;
}

/** A file read or parse failure: not JSON, or not what this app expects. */
export function badFile(err, file, fix, onRetry) {
  return showProblem(err instanceof SyntaxError ? 'bad_json' : 'bad_input', {
    subject: file?.name,
    detail: String(err?.message || err),
    fix,
    onRetry,
  });
}

/** window.open() came back null: the browser's pop-up blocker. */
export function popupBlocked(subject, onRetry) {
  return showProblem('permission_denied', {
    subject,
    detail: 'The browser blocked the window.',
    fix: ['Allow pop-ups for this page (the icon at the right of the address bar), then Retry.'],
    onRetry,
  });
}
