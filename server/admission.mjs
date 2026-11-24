// Bound work in one Node process. Overload receives a retryable response rather
// than queuing indefinitely and exhausting memory or database connections.
export function requestAdmission(limit = 64) {
  let active = 0;
  return (_req, res) => {
    if (active >= limit) {
      res.writeHead(503, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Retry-After':'3', Connection:'close' });
      res.end('{"error":"The café is busy. Please try again shortly."}');
      return false;
    }
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release);
    res.once('close', release);
    return true;
  };
}
