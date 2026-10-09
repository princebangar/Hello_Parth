/**
 * Error text can carry credentials (the Google Maps loader, for one, puts its whole options object - API key
 * included - into its error message). Anything shown to a person goes through this first.
 */
export function redactSecrets(value) {
  return String(value ?? "")
    .replace(/AIza[\w-]{20,}/g, "[key]") // Google API keys
    .replace(/([?&](?:key|apikey|api_key|token|access_token)=)[^&\s"']+/gi, "$1[hidden]")
    .replace(/(bearer\s+)[\w.~+/-]+=*/gi, "$1[hidden]")
    .replace(/\bey[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, "[token]") // JWTs
    .replace(/\{[\s\S]*$/, "") // an options / JSON dump after the sentence
    .trim();
}

/** Short, safe text for an error screen or alert. */
export function safeErrorText(error, max = 120) {
  return redactSecrets(error?.message || error || "").slice(0, max);
}
