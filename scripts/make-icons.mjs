// Renders the Elsewhere app icons (forest field, gold eight-point star) to PNG with Playwright.
import { chromium } from 'playwright';
const star = 'M20 1L23.2 15.5L34.1 5.9L24.5 16.8L39 20L24.5 23.2L34.1 34.1L23.2 24.5L20 39L16.8 24.5L5.9 34.1L15.5 23.2L1 20L15.5 16.8L5.9 5.9L16.8 15.5Z';
const svg = (pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${round}" fill="#0e2721"/><circle cx="50" cy="50" r="${34 - pad}" fill="none" stroke="#e6cb98" stroke-opacity=".35" stroke-width=".8"/><g transform="translate(${50 - (40 - pad * 2) / 2} ${50 - (40 - pad * 2) / 2}) scale(${(40 - pad * 2) / 40})"><path d="${star}" fill="#e6cb98"/></g></svg>`;
const b = await chromium.launch(); const p = await b.newPage();
for (const [name, size, pad, round] of [['icon-192', 192, 0, 22], ['icon-512', 512, 0, 22], ['maskable-512', 512, 6, 0], ['apple-touch-icon', 180, 0, 0]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg(pad, round).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: `assets/icons/${name}.png`, omitBackground: true });
}
await b.close(); console.log('icons written');
