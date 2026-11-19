// The small R2 subset Wanderlust's server uses, implemented on Netlify Blobs (strong consistency,
// conditional writes), so the same sync code runs unchanged.
const quote = e => (e && !String(e).startsWith('"') ? '"' + e + '"' : e);
function wrap(key, data, etag, md, range) {
  let body = data === null ? null : new Uint8Array(data);
  if (body && range) body = body.subarray(range.offset, range.length ? range.offset + range.length : undefined);
  const text = () => new TextDecoder().decode(new Uint8Array(data));
  return { key, size: md?.size ?? data?.byteLength ?? 0, etag, httpEtag: quote(etag), httpMetadata: { contentType: md?.contentType }, customMetadata: md?.custom || {}, body, json: async () => JSON.parse(text()), text: async () => text(), arrayBuffer: async () => data };
}
export function netlifyBucket(store) {
  return {
    async list({ prefix = '' } = {}) { const r = await store.list({ prefix }); return { objects: r.blobs.map(b => ({ key: b.key })), truncated: false }; },
    async head(key) { const r = await store.getMetadata(key); return r ? wrap(key, null, r.etag, r.metadata) : null; },
    async get(key, opts = {}) { const r = await store.getWithMetadata(key, { type: 'arrayBuffer' }); return r ? wrap(key, r.data, r.etag, r.metadata, opts.range) : null; },
    async put(key, value, opts = {}) {
      const data = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : value;
      const conditions = opts.onlyIf?.etagMatches ? { onlyIfMatch: opts.onlyIf.etagMatches } : opts.onlyIf?.etagDoesNotMatch === '*' ? { onlyIfNew: true } : {};
      const r = await store.set(key, data, { metadata: { contentType: opts.httpMetadata?.contentType || 'application/octet-stream', custom: opts.customMetadata || {}, size: data.byteLength }, ...conditions });
      if (r && r.modified === false) return null;
      const etag = r?.etag || (await store.getMetadata(key))?.etag;
      return { etag, httpEtag: quote(etag) };
    },
    async delete(key) { await store.delete(key); },
  };
}
