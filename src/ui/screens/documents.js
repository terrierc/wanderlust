// Documents wallet: encrypted on this device, never synced or sent anywhere.
import { esc, icon, field, formValues, toast, confirmDialog } from '../kit.js';
import { newId } from '../../core/store.js';
import { prettyDate } from '../../core/domain.js';
import { DOC_KINDS, listVault, saveVault, expiringSoon } from '../../core/vault.js';
import { ACCEPTED } from '../../core/files.js';
export const view = {
  render(ctx) {
    return {
      title: 'Documents', screen: 'documents',
      html: '<section class="page narrow"><a class="back" href="/more">' + icon('back') + ' More</a><p class="eyebrow">Only on this device</p><h1>Documents</h1><p class="lede">Passports, visas, insurance and vaccination records, for offline use. They are encrypted on this device and are never synced or sent anywhere.</p>' +
        '<p class="notice small">Anyone who can use this unlocked device and browser can open them in Wanderlust. To keep a copy elsewhere, make a passphrase-protected backup (More → Backup & restore): documents are included only in encrypted backups. Each device keeps its own.</p>' +
        '<div id="vaultList"><p class="muted">Opening…</p></div>' +
        '<form class="panel grid-form" data-form="vaultAdd"><h2 class="wide">Add a document</h2>' + field(['kind', 'Type', 'select', DOC_KINDS], 'Passport') + field(['person', 'Whose', 'select', ['You', 'Partner', 'Both']], 'You') + field(['title', 'Title'], '', { required: true }) + field(['expiry', 'Expires', 'date'], '', { hint: 'Warns from six months before.' }) + field(['notes', 'Notes', 'textarea'], '') + '<div class="field wide"><label for="vf">File (PDF or photo, optional)</label><input id="vf" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div><div class="wide row end"><button class="btn primary">Save on this device</button></div></form></section>',
      async mount(root) {
        const items = (await listVault(ctx.store.db)).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999')), soon = new Set(expiringSoon(items).map(i => i.id));
        root.querySelector('#vaultList').innerHTML = items.length ? '<ul class="rows">' + items.map(i => '<li class="row-item static"><span><strong>' + esc(i.title) + '</strong><small>' + esc(i.kind) + ' · ' + esc(i.person) + (i.expiry ? ' · expires ' + esc(prettyDate(i.expiry)) : '') + '</small>' + (soon.has(i.id) ? '<small class="flag">Expires within six months</small>' : '') + (i.notes ? '<small>' + esc(i.notes) + '</small>' : '') + '</span>' + (i.blob ? '<a class="btn small ghost" data-vault-file="' + esc(i.id) + '" download="' + esc(i.fileName || i.title) + '">Open</a>' : '') + '<button class="iconbtn" data-act="vaultDelete" data-id="' + esc(i.id) + '" aria-label="Delete ' + esc(i.title) + '">' + icon('trash') + '</button></li>').join('') + '</ul>' : '<p class="muted">No documents yet.</p>';
        for (const a of root.querySelectorAll('[data-vault-file]')) { const it = items.find(i => i.id === a.dataset.vaultFile); a.href = URL.createObjectURL(it.blob); }
      },
    };
  },
};
export const forms = {
  async vaultAdd(f, ctx) {
    const v = formValues(f), file = f.file.files[0];
    if (file && (!ACCEPTED[file.type] || file.size > 15e6)) throw new Error('Use a PDF, JPG, PNG or WebP under 15 MB.');
    await saveVault(ctx.store.db, { id: newId('doc'), kind: v.kind, person: v.person, title: v.title, expiry: v.expiry, notes: v.notes, fileName: file?.name || '' }, file || null);
    f.reset(); toast('Saved and encrypted on this device'); ctx.rerender();
  },
};
export const actions = { async vaultDelete(el, ctx) { if (!await confirmDialog('Delete this document from this device?', { ok: 'Delete', danger: true, detail: 'It is not stored anywhere else unless it is in an encrypted backup.' })) return; await ctx.store.db.del('vault', el.dataset.id); ctx.rerender(); } };
