'use strict';
/** Browser smoke test: real Chromium + real HTML/JS, with google.script.run shimmed onto the mock-backed .gs code. */
const http = require('http'), fs = require('fs'), path = require('path');
const { createEnv } = require('./gas-mock.cjs');
const SRC = path.join(__dirname, '..', 'src');
const env = createEnv(SRC), { ctx, state } = env;
let playwright; try { playwright = require('/opt/node22/lib/node_modules/playwright'); } catch (e) { playwright = require('playwright'); }

const shim = `<script>
window.__errors = [];
window.addEventListener('error', e => window.__errors.push(e.message));
window.google = { script: { run: (function () {
  function mk(ok, fail) { return { withSuccessHandler(f) { return mk(f, fail); }, withFailureHandler(f) { return mk(ok, f); },
    api(a, p, c) { fetch('/api?u=' + encodeURIComponent(window.__user), { method: 'POST', body: JSON.stringify({ a, p }) }).then(r => r.json()).then(r => ok && ok(r), e => fail && fail(e)); } }; }
  return mk(null, null); })() } };
</script>`;
const page = () => {
  let h = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  h = h.replace(/<\?!= include_\('(\w+)'\) \?>/g, (m, n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'));
  return h.replace('<base target="_top">', shim);
};
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => { const { a, p } = JSON.parse(b); state.active = u.searchParams.get('u'); const r = ctx.api(a, p, 'e2e'); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(r)); });
  } else { res.setHeader('content-type', 'text/html'); res.end(page()); }
});

(async () => {
  ctx.setupAMLSystem = ctx.setupAMLSystem; state.active = 'owner@firm.test'; ctx.setupAMLSystem();
  const api = (u, a, p) => { state.active = u; const r = ctx.api(a, p || {}); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
  api('owner@firm.test', 'userSave', { Name: 'Mlro', Email: 'mlro@firm.test', Role: 'MLRO', Status: 'Active' });
  api('owner@firm.test', 'userSave', { Name: 'Auditor', Email: 'aud@firm.test', Role: 'Auditor', Status: 'Active' });
  api('owner@firm.test', 'userSave', { Name: 'Viewer', Email: 'view@firm.test', Role: 'Viewer', Status: 'Active' });
  state.active = 'owner@firm.test'; ctx.resetMemo_(); ctx.seedTestData();
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const browser = await playwright.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }).catch(() => playwright.chromium.launch({ args: ['--no-sandbox'] }));
  let failures = 0; const check = (c, m) => { if (!c) { failures++; console.log('FAIL:', m); } else console.log('ok  :', m); };
  const shots = path.join(__dirname, 'screenshots'); fs.mkdirSync(shots, { recursive: true });

  async function session(user, fn) {
    const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } }); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.addInitScript(u => { window.__user = u; }, user);
    await pg.goto(`http://localhost:${port}/`); await pg.waitForSelector('#side .nav', { timeout: 8000 });
    await fn(pg); check(errs.length === 0, user + ' no JS errors ' + errs.join(' | ')); await pg.close();
  }
  const nav = async (pg, text) => { await pg.click(`#side a.nav:text-is("${text}")`); await pg.waitForTimeout(250); };

  await session('mlro@firm.test', async pg => {
    check((await pg.textContent('#view')).includes('Total companies'), 'dashboard renders');
    await pg.screenshot({ path: path.join(shots, 'dashboard.png') });
    await nav(pg, 'All Companies'); await pg.waitForSelector('#clist table');
    check((await pg.textContent('#clist')).includes('TEST COMPANY'), 'company list shows test company');
    await pg.click('#clist a[data-act="open-company"]'); await pg.waitForSelector('.hdr-card');
    for (const t of ['Engagements', 'UBOs', 'Ownership', 'Documents', 'KYC Review', 'Risk Assessment', 'Audit History']) {
      await pg.click(`.tabs a:has-text("${t}")`); await pg.waitForTimeout(300);
      const txt = await pg.textContent('#ctab'); check(txt.length > 20 && !/undefined|\[object/.test(txt), 'tab renders: ' + t);
    }
    await pg.click('.tabs a:has-text("Ownership")'); await pg.waitForTimeout(200);
    check((await pg.textContent('#ctab')).includes('effective'), 'ownership chains displayed');
    await pg.screenshot({ path: path.join(shots, 'ownership.png') });
    await pg.click('.tabs a:has-text("Documents")'); await pg.waitForTimeout(200); await pg.click('button:has-text("Upload document")'); await pg.waitForSelector('#u_file');
    await pg.setInputFiles('#u_file', { name: 'cr.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') });
    await pg.selectOption('#u_type', 'Commercial Registration (CR)'); await pg.click('.mf button.primary'); await pg.waitForTimeout(600);
    check((await pg.textContent('#ctab')).includes('cr.pdf'), 'document uploaded via UI');
    check((await pg.textContent('#modal-root')).includes('No expiry date'), 'expiry warning shown'); await pg.click('#modal-root .mf button');
    await pg.screenshot({ path: path.join(shots, 'documents.png') });
    await pg.click('.tabs a:has-text("Risk Assessment")'); await pg.waitForSelector('#rk_res'); await pg.click('button:has-text("Apply suggestions")');
    await pg.screenshot({ path: path.join(shots, 'risk.png') });
    await pg.click('.tabs a:has-text("KYC Review")'); await pg.waitForSelector('.checklist');
    await pg.screenshot({ path: path.join(shots, 'kyc.png') });
    await nav(pg, 'Add Company'); await pg.waitForSelector('#f_LegalName');
    await pg.fill('#f_LegalName', 'E2E Company WLL'); await pg.fill('#f_QFCNumber', 'E2E-1'); await pg.fill('#f_CountryOfIncorporation', 'Qatar'); await pg.click('.mf button.primary'); await pg.waitForSelector('.hdr-card:has-text("E2E Company")', { timeout: 5000 });
    check(true, 'company created via UI');
    await pg.click('.mf button, button:has-text("Cancel")').catch(() => { });
    await nav(pg, 'Reviews'); await pg.waitForSelector('#rvl table'); check(true, 'reviews page');
    await nav(pg, 'Documents'); await pg.waitForSelector('#dgl table'); check(true, 'documents page');
    await nav(pg, 'Reports'); await pg.selectOption('#rp_co', { index: 1 }); await pg.click('[data-type="companyKyc"]'); await pg.waitForSelector('#rpout table'); check(true, 'report renders');
    await nav(pg, 'Audit Log'); await pg.waitForSelector('#aul table'); check(true, 'audit log page');
    await nav(pg, 'User Management'); await pg.waitForSelector('table'); check(true, 'users page');
    await nav(pg, 'System Settings'); await pg.waitForSelector('textarea'); check(true, 'settings page');
    await pg.screenshot({ path: path.join(shots, 'settings.png') });
    await pg.fill('#gsearch', 'test person'); await pg.waitForSelector('#results .r', { timeout: 4000 }); check((await pg.textContent('#results')).includes('TEST COMPANY'), 'global search by UBO name');
  });
  await session('view@firm.test', async pg => {
    const nav_ = await pg.textContent('#side');
    check(!nav_.includes('User Management') && !nav_.includes('Audit Log') && !nav_.includes('Add Company'), 'viewer nav hides admin items');
    await nav(pg, 'All Companies'); await pg.waitForSelector('#clist table'); await pg.click('#clist a[data-act="open-company"]'); await pg.waitForSelector('.hdr-card');
    check(!(await pg.$('button:has-text("Edit")')) && !(await pg.$('button:has-text("Delete")')), 'viewer has no edit/delete buttons');
    await pg.click('.tabs a:has-text("Documents")'); await pg.waitForTimeout(300); check(!(await pg.$('button:has-text("Upload document")')), 'viewer has no upload button');
  });
  await session('aud@firm.test', async pg => {
    await nav(pg, 'All Companies'); await pg.waitForSelector('#clist table'); check((await pg.textContent('#side')).includes('Add Company'), 'auditor can add company');
  });
  await browser.close(); srv.close();
  console.log(failures ? failures + ' e2e failure(s)' : 'e2e passed'); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
