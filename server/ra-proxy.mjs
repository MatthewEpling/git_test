// Forwards /ra/* to retroachievements.org so the browser app can call the RA API
// (RetroAchievements does not allow cross-origin requests from web pages).
const RA = 'https://retroachievements.org';
const USER_AGENT = 'Dreamport/0.1 (browser Dreamcast frontend; Flycast libretro)';

export async function proxyRetroAchievements(req, res, url) {
  const target = RA + url.pathname.slice(3) + url.search;
  if (!url.pathname.startsWith('/ra/dorequest.php')) {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const c of req) {
    chunks.push(c);
    if (chunks.reduce((n, x) => n + x.length, 0) > 64 * 1024) {
      res.writeHead(413).end();
      return;
    }
  }
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { 'Content-Type': req.headers['content-type'] ?? 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    });
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ Success: false, Error: `Could not reach RetroAchievements (${e.message})` }));
  }
}
