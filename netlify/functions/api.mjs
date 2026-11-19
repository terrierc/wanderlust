// Elsewhere API on Netlify: sync, documents and the earlier JSON routes. Behind the passphrase gate.
import { getStore } from '@netlify/blobs';
import server from '../../dist/netlify-server/index.mjs';
import { netlifyBucket } from '../../server/netlify-bucket.mjs';
export default async req => server.fetch(req, { BUCKET: netlifyBucket(getStore({ name: 'elsewhere', consistency: 'strong' })) });
export const config = { path: ['/api/*', '/mcp', '/feed/*'] };
