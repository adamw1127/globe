// Access to Claude from the published page (claude.ai Artifact "sample"
// capability). Resolves null anywhere else, e.g. a self-hosted copy.
let samplePromise;
export function getSample() {
  samplePromise ??= window.claude?.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
  return samplePromise;
}

// Viewer-facing copy for a failed call; null means "say nothing".
export function aiErrorText(code) {
  switch (code) {
    case 'cancelled':
      return null;
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return 'Claude is not available on this page. Allow it from the page\'s permissions to use AI features.';
    case 'rate_limited':
      return 'Too many requests right now. Wait a moment, then try again.';
    case 'session_expired':
      return 'Your session has expired. Sign in to claude.ai again.';
    case 'prompt_too_large':
      return 'That request was too large. Ask about a shorter span of years.';
    case 'refused':
      return 'Claude could not answer that. Try rephrasing the question.';
    default:
      return 'Something went wrong while asking Claude. Try again.';
  }
}
