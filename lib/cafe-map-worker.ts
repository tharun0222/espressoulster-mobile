// Workers do not receive WebView.loadUrl's navigation-only headers. Fetch the
// bundled worker as an app request and validate it before starting a local
// Blob worker, so a tunnel's HTML notice cannot silently become worker code.
export async function cafeMapWorker(source: string, signal: AbortSignal) {
  const url = new URL(source, window.location.href);
  if (url.origin !== window.location.origin) throw new Error("Map worker must use the app origin.");
  const preview = /\.(?:ngrok-free\.dev|ngrok-free\.app)$/.test(url.hostname);
  const response = await fetch(url, {
    signal,
    redirect: "error",
    credentials: "same-origin",
    cache: "no-store",
    headers: preview ? { "ngrok-skip-browser-warning": "1" } : {},
  });
  const type = response.headers.get("content-type") || "";
  if (!response.ok || !/^(?:application|text)\/(?:javascript|x-javascript)\b/i.test(type)) {
    throw new Error("Map worker unavailable.");
  }
  const script = await response.text();
  signal.throwIfAborted();
  if (!script.trim() || /^\s*<!doctype html|^\s*<html/i.test(script)) throw new Error("Map worker unavailable.");
  return URL.createObjectURL(new Blob([script], { type: "application/javascript" }));
}
