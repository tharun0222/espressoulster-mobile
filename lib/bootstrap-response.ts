import { json } from './server';

export function bootstrapResponse(data: unknown, acceptEncoding: string | null) {
  const response = json(data);
  response.headers.append('Vary', 'Accept-Encoding');
  const encodings = (acceptEncoding ?? '').split(',').map(encoding => {
    const [name, ...parameters] = encoding.trim().split(';');
    const quality = parameters.map(value => value.trim()).find(value => value.startsWith('q='));
    return { name: name.toLowerCase(), quality: quality === undefined ? 1 : Number(quality.slice(2)) };
  });
  const support = encodings.find(encoding => encoding.name === 'gzip') ?? encodings.find(encoding => encoding.name === '*');
  if (!response.body || !support || !(support.quality > 0 && support.quality <= 1)) return response;

  response.headers.set('Content-Encoding', 'gzip');
  return new Response(response.body.pipeThrough(new CompressionStream('gzip')), {
    status: response.status,
    headers: response.headers,
  });
}
