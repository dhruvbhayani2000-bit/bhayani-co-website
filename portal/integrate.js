/* Bhayani & Co portal — client integration inside each desk.
   - Set up once: clients the admin links to this desk are created here with the desk's own "new company" code,
     saved in the desk's own format, and kept in step (name, PAN, TAN, GSTINs).
   - Dashboard: the desk's headline tiles for a linked client are saved so /clients can show them.
   - Upload once: files uploaded on the client dashboard are offered here and read by the desk's own importer.
   - Figures flow: Depreciation → Financial Analysis → CFO Desk, applied with one click in the receiving desk.
   Runs only when the desk is opened through the portal (connect.js calls PortalIntegrate.before / after). */
(function () {
  'use strict';
  const CFG = window.PORTAL;
  const G = n => { try { return (0, eval)(n); } catch { return undefined; } };          // a desk's own top-level names
  const SETCUR = v => { window.__portalCur = v; try { (0, eval)('cur = window.__portalCur'); } catch {} delete window.__portalCur; };
  const FIRM = 'data/users/firm';
  const fyLabel = Y => `FY ${Y}-${String(Y + 1).slice(2)}`;
  const lakh = n => Math.round((+n || 0) / 1e5 * 100) / 100;
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const domReady = () => document.readyState === 'loading' ? new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true })) : Promise.resolve();
  const curFY = () => { const t = new Date(); return t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; };

  // ---------------------------------------------------------------- one adapter per desk
  // existing(db): saved companies (as stored) · make(p): new company from a client profile · write(db, co): save in the desk's format
  // patch(stored, p): stored record with the profile's identity applied (or null) · open(co): show it · ready(): desk finished loading
  const firmDocs = async (db, keep) => (await db.collection(FIRM).get()).docs.map(d => d.data()).filter(v => v && keep(v));
  const settingsPatch = (doc, p, extra) => {
    const s = doc.settings || {}, n = { ...s, name: p.name };
    if (p.pan) n.pan = p.pan; if (p.tan && 'tan' in s) n.tan = p.tan; if (extra) extra(n);
    return JSON.stringify(n) === JSON.stringify(s) ? null : { ...doc, settings: n };
  };
  const selectCompany = id => { const sel = document.getElementById('company'); if (!sel) return; sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); };
  const accountReady = () => G('mode') === 'account' && Array.isArray(G('companies'));
  const A = {
    gst: {
      ready: () => G('mode') === 'account' && Array.isArray(G('clients')),
      list: () => G('clients') || [],
      name: co => co.name,
      async existing(db) { return (await db.collection('clients').get()).docs.map(d => d.data()).filter(v => v && v.kind === 'client'); },
      make(p) {
        const n = G('blankClient')(p.name);
        Object.assign(n, { pan: p.pan || '', constitution: p.constitution || n.constitution, aato: p.aato === '' || p.aato == null ? n.aato : +p.aato, fy: +p.fy || n.fy });
        n.gstins = (p.gstins || []).map((g, i) => ({ gstin: g.gstin, state: g.gstin.slice(0, 2), trade: g.trade || p.name, freq: g.freq || ((+n.aato || 0) <= 5 ? 'Q' : 'M'), einv: (+n.aato || 0) >= 5, tds: false, isd: false, regDate: '', principal: i === 0 }));
        return n;
      },
      async write(db, n) {
        const { meta, docs } = G('docsOf')(n);
        for (const [id, d] of Object.entries(docs)) await db.doc(`clients/${n.id}/chunks/${id}`).set(d);
        await db.doc(`clients/${n.id}`).set(meta);
      },
      patch(m, p) {
        const n = { ...m, name: p.name };
        if (p.pan) n.pan = p.pan;
        if (p.constitution) n.constitution = p.constitution;
        const have = new Set((m.gstins || []).map(g => g.gstin));
        const add = (p.gstins || []).filter(g => !have.has(g.gstin)).map(g => ({ gstin: g.gstin, state: g.gstin.slice(0, 2), trade: g.trade || p.name, freq: g.freq || 'M', einv: (+m.aato || 0) >= 5, tds: false, isd: false, regDate: '', principal: !(m.gstins || []).length }));
        if (add.length) n.gstins = [...(m.gstins || []), ...add];
        return JSON.stringify(n) === JSON.stringify(m) ? null : n;
      },
      async savePatch(db, n) { await db.doc(`clients/${n.id}`).set(n); },
      open(co) { const f = G('openClient'); if (f) f(co.id); },
    },
    tds: {
      ready: accountReady, list: () => G('companies') || [], name: co => co.settings.name,
      existing: db => firmDocs(db, v => v.kind === 'meta' && v.settings),
      make(p) { const n = G('blankCompany')(p.name); const Y = +p.fy || curFY(); Object.assign(n.settings, { pan: p.pan || '', tan: p.tan || '', fyStart: `${Y}-04-01`, constitution: p.constitution || n.settings.constitution, over10cr: p.aato === '' || p.aato == null ? n.settings.over10cr : +p.aato > 10 }); return n; },
      async write(db, n) { for (const [id, d] of Object.entries(G('splitDocs')(JSON.parse(JSON.stringify(n))))) await db.doc(`${FIRM}/${id}`).set(d); },
      patch: (m, p) => settingsPatch(m, p),
      async savePatch(db, n) { await db.doc(`${FIRM}/${n.id}`).set(n); },
      open: co => selectCompany(co.id),
    },
    depreciation: {
      ready: accountReady, list: () => G('companies') || [], name: co => co.settings.name,
      existing: db => firmDocs(db, v => v.settings && Array.isArray(v.assets)),
      make(p) { const n = G('blankCompany')(p.name); const Y = +p.fy || curFY(); Object.assign(n.settings, { fyStart: `${Y}-04-01`, fyEnd: `${Y + 1}-03-31` }); return n; },
      async write(db, n) { await db.doc(`${FIRM}/${n.id}`).set(JSON.parse(JSON.stringify(n))); },
      patch: (m, p) => { const s = m.settings || {}; return s.name === p.name ? null : { ...m, settings: { ...s, name: p.name } }; },
      async savePatch(db, n) { await db.doc(`${FIRM}/${n.id}`).set(n); },
      open: co => selectCompany(co.id),
    },
    costing: {
      ready: accountReady, list: () => G('companies') || [], name: co => co.settings.name,
      existing: db => firmDocs(db, v => v.settings && v.cfg),
      make(p) { const n = G('blankCompany')(p.name); Object.assign(n.settings, { industry: CFG.industries[p.industry] || '', turnover: p.aato === '' || p.aato == null ? '' : +p.aato }); return n; },
      async write(db, n) { await db.doc(`${FIRM}/${n.id}`).set(JSON.parse(JSON.stringify(n))); },
      patch: (m, p) => { const s = m.settings || {}; return s.name === p.name ? null : { ...m, settings: { ...s, name: p.name } }; },
      async savePatch(db, n) { await db.doc(`${FIRM}/${n.id}`).set(n); },
      open: co => selectCompany(co.id),
    },
    'financial-analysis': {
      ready: accountReady, list: () => G('companies') || [], name: co => co.name,
      existing: db => firmDocs(db, v => Array.isArray(v.years)),
      make(p) { const n = G('blankCompany')(p.name); n.industry = CFG.industries[p.industry] || ''; return n; },
      async write(db, n) { await db.doc(`${FIRM}/${n.id}`).set(JSON.parse(JSON.stringify(n))); },
      patch: (m, p) => m.name === p.name ? null : { ...m, name: p.name },
      async savePatch(db, n) { await db.doc(`${FIRM}/${n.id}`).set(n); },
      open: co => selectCompany(co.id),
    },
    cfo: {
      ready: accountReady, list: () => G('companies') || [], name: co => co.settings.name,
      existing: db => firmDocs(db, v => v.kind === 'meta' && v.settings),
      make(p) { return G('blankCompany')(p.name); },
      async write(db, n) { for (const [id, d] of Object.entries(G('splitDocs')(JSON.parse(JSON.stringify(n))))) await db.doc(`${FIRM}/${id}`).set(d); },
      patch: (m, p) => { const s = m.settings || {}; return s.name === p.name ? null : { ...m, settings: { ...s, name: p.name } }; },
      async savePatch(db, n) { await db.doc(`${FIRM}/${n.id}`).set(n); },
      open: co => selectCompany(co.id),
    },
    remittance: {
      ready: accountReady, list: () => G('companies') || [], name: co => co.settings.name,
      existing: db => firmDocs(db, v => v.kind === 'co' && v.settings),
      make(p) { const n = G('blankCo')(p.name); Object.assign(n.settings, { pan: p.pan || '', tan: p.tan || '', constitution: p.constitution || n.settings.constitution, address: p.address || '', email: p.email || '' }); return n; },
      async write(db, n) { await db.doc(`${FIRM}/${n.id}`).set({ kind: 'co', ...JSON.parse(JSON.stringify(n)) }); },
      patch: (m, p) => settingsPatch(m, p),
      async savePatch(db, n) { await db.doc(`${FIRM}/${n.id}`).set(n); },
      open: co => selectCompany(co.id),
    },
    'internal-audit': {
      ready: () => { const S = G('S'); return !!(S && S.ready); },
      list: () => { const S = G('S'); return S && S.live ? S.d.clients : []; },
      name: co => co.name,
      async existing(db) { return (await db.collection('clients').get()).docs.map(d => ({ ...d.data(), id: d.id })); },
      async canCreate(db) { return (await db.doc('config/firm').get()).exists; },
      make(p) { return { id: 'p_' + p.id, name: p.name, industry: p.industry || 'mfg', city: p.address || '', contact: p.contact || '', turnover: p.aato === '' || p.aato == null ? '' : `₹${p.aato} crore`, createdAt: new Date().toISOString() }; },
      async write(db, n) { const { id, ...d } = n; await db.doc(`clients/${id}`).set(d); },
      patch: (m, p) => m.name === p.name ? null : { ...m, name: p.name },
      async savePatch(db, n) { const { id, ...d } = n; await db.doc(`clients/${id}`).set(d); },
      open() { const b = document.querySelector('[data-nav="clients"]'); if (b) b.click(); },
    },
  };

  let ctx = null, ad = null, profiles = {}, links = {};

  // ---------------------------------------------------------------- 1. set up once (runs before the desk loads its data)
  async function before(c) {
    ctx = c; ad = A[c.tool]; if (!ad) return;
    await domReady();
    const db = c.db;
    try {
      const [ps, ls] = await Promise.all([db.collection('_pclients').get(), db.collection('_plinks').get()]);
      ps.docs.forEach(d => { profiles[d.id] = d.data(); });
      ls.docs.forEach(d => { links[d.id] = d.data(); });
      if (!Object.keys(profiles).length || ctx.level === 'view') return;
      if (ad.canCreate && !(await ad.canCreate(db))) return;
      const have = await ad.existing(db);
      for (const p of Object.values(profiles)) {
        const mine = have.find(x => x.portalId === p.id);
        try {
          if (!mine) {
            if (links[p.id]) continue;                          // created before and since deleted in the desk: respect that
            const n = ad.make(p); n.portalId = p.id;
            await ad.write(db, n);
            links[p.id] = { companyId: n.id, syncedAt: p.updatedAt || '', at: new Date().toISOString() };
            await db.doc(`_plinks/${p.id}`).set(links[p.id]);
          } else if (!links[p.id] || (p.updatedAt || '') > (links[p.id].syncedAt || '')) {
            const n = ad.patch(mine, p);
            if (n) await ad.savePatch(db, n);
            links[p.id] = { companyId: mine.id, syncedAt: p.updatedAt || '', at: (links[p.id] && links[p.id].at) || new Date().toISOString() };
            await db.doc(`_plinks/${p.id}`).set(links[p.id]);
          }
        } catch (e) { console.warn('portal link', p.name, e); }
      }
    } catch (e) { console.warn('portal set-up', e); }
  }

  // ---------------------------------------------------------------- after the desk has loaded
  async function after() {
    if (!ad) return;
    const t0 = Date.now();
    while (!ad.ready() && Date.now() - t0 < 25000) await sleep(250);
    if (!ad.ready()) return;
    const want = new URLSearchParams(location.search).get('client');
    if (want) {
      const co = ad.list().find(x => x.portalId === want);
      if (co) { try { ad.open(co); } catch (e) { console.warn(e); } }
    }
    panelMount();
    watchStatus();
    loadInbox();
    setInterval(() => { const c = currentLinked(); const k = c ? c.portalId : ''; if (k !== lastShown) { lastShown = k; renderPanel(); } }, 1200);
  }
  let lastShown = null;
  const currentLinked = () => {
    if (ctx.tool === 'internal-audit') {
      const S = G('S'); if (!S || !S.live) return null;
      const e = (S.d.engagements || []).find(x => x.id === S.eng);
      const cl = e && (S.d.clients || []).find(x => x.id === e.clientId);
      return cl && cl.portalId ? cl : null;
    }
    const c = G('cur'); return c && !c.sample && c.portalId ? c : null;
  };

  // ---------------------------------------------------------------- 2. dashboard status
  const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  function scrape() {
    const els = [...document.querySelectorAll('.tot, .tile')].filter(e => e.offsetParent && e.querySelector('.v') && !e.closest('#portal-int'));
    return els.slice(0, 6).map(e => ({ k: txt(e.querySelector('.k, .eyebrow')), v: txt(e.querySelector('.v')), n: txt(e.querySelector('.n, .muted')), tone: ['bad', 'warn', 'good'].find(c => e.classList.contains(c)) || '' })).filter(t => t.k && t.v);
  }
  const sent = {};
  async function putStatus(pid, data) {
    const key = JSON.stringify(data.tiles) + (data.extra ? JSON.stringify(data.extra) : '');
    if (sent[pid] === key) return; sent[pid] = key;
    try { await ctx.db.doc(`_pstatus/${pid}`).set({ ...data, at: new Date().toISOString(), by: ctx.email }); } catch {}
  }
  function watchStatus() {
    let t = null, first = 0;
    const run = () => {
      clearTimeout(t);
      if (!first) first = Date.now();
      const wait = Math.max(0, Math.min(2500, 6000 - (Date.now() - first)));   // settle for 2.5 s, but never wait more than 6 s on a busy page
      t = setTimeout(() => {
        first = 0;
        if (ctx.tool === 'internal-audit') return iaStatus();
        const co = currentLinked(); if (!co) return;
        const tiles = scrape(); if (tiles.length) putStatus(co.portalId, { name: ad.name(co), tiles });
        flows(co);
      }, wait);
    };
    new MutationObserver(run).observe(document.body, { subtree: true, childList: true, characterData: true });
    run();
  }
  function iaStatus() {
    const S = G('S'); if (!S || !S.live) return;
    (S.d.clients || []).filter(c => c.portalId).forEach(c => {
      const eng = (S.d.engagements || []).filter(e => e.clientId === c.id);
      const ids = new Set(eng.map(e => e.id));
      const obs = (S.d.observations || []).filter(o => ids.has(o.engId) && o.status !== 'Closed' && o.status !== 'Draft');
      const latest = eng.slice().sort((a, b) => String(b.periodTo || '').localeCompare(String(a.periodTo || '')))[0];
      putStatus(c.portalId, { name: c.name, tiles: [
        { k: 'Engagements', v: String(eng.length), n: latest ? `${latest.title || ''} · ${latest.status || ''}` : 'None yet', tone: '' },
        { k: 'Open observations', v: String(obs.length), n: `${obs.filter(o => o.risk === 'High').length} high risk`, tone: obs.some(o => o.risk === 'High') ? 'bad' : obs.length ? 'warn' : 'good' },
      ] });
    });
  }

  // ---------------------------------------------------------------- 4. figures flow (sent from Depreciation and Financial Analysis)
  async function sendTo(tool, pid, from, data) {
    const key = tool + pid + JSON.stringify(data);
    if (sent['flow' + tool + pid] === key) return; sent['flow' + tool + pid] = key;
    try {
      const path = `_pinbox/${pid}~${from}`;
      const { data: old } = await ctx.sb.from('docs').select('data').eq('tool', tool).eq('path', path).maybeSingle();
      if (old && JSON.stringify(old.data.figures) === JSON.stringify(data.figures)) return;
      await ctx.sb.from('docs').upsert({ tool, path, parent: '_pinbox', doc_id: `${pid}~${from}`, data: { ...data, from, clientId: pid, at: new Date().toISOString(), by: ctx.email, applied: '' }, updated_by: ctx.uid }, { onConflict: 'tool,path' });
    } catch {}
  }
  function flows(co) {
    const p = profiles[co.portalId]; if (!p) return;
    const linked = t => (p.tools || []).includes(t);
    if (ctx.tool === 'depreciation') {
      try {
        const R = G('compute')(co), Y = +String(co.settings.fyStart || '').slice(0, 4);
        if (!R || !Y) return;
        const blockOf = {}; (co.cats || []).forEach(c => { blockOf[c.name] = c.block; });
        const nbv = R.sched.reduce((t, x) => t + (x.nbv || 0), 0), intang = R.sched.filter(x => blockOf[x.cat] === 'Intangible assets').reduce((t, x) => t + (x.nbv || 0), 0);
        const figures = { Y, fy: fyLabel(Y), dep: lakh(R.dt.bookDep), nfa: lakh(nbv - intang), intang: lakh(intang), dtl: lakh(R.dt.dtl) };
        if (!figures.dep && !figures.nfa && !figures.intang) return;          // nothing in the register yet
        if (linked('financial-analysis')) sendTo('financial-analysis', co.portalId, 'depreciation', { name: co.settings.name, figures });
        if (linked('cfo')) sendTo('cfo', co.portalId, 'depreciation', { name: co.settings.name, figures });
      } catch (e) { console.warn('flow dep', e); }
    }
    if (ctx.tool === 'financial-analysis' && linked('cfo')) {
      try {
        const y = co.years[co.ay] || co.years[co.years.length - 1]; if (!y) return;
        const v = k => +(y.v || {})[k] || 0, rev = v('rev'), mat = v('mat');
        const figures = { fy: y.label, dso: rev ? r2(v('rec') / rev * 365) : 0, dio: mat ? r2(v('invy') / mat * 365) : 0, dpo: mat ? r2(v('tp') / mat * 365) : 0, cash: r2(v('cash')), fc: r2(v('int')), dep: r2(v('dep')) };
        if (rev || mat || figures.cash) sendTo('cfo', co.portalId, 'financial-analysis', { name: co.name, figures });
      } catch (e) { console.warn('flow fa', e); }
    }
  }

  // ---------------------------------------------------------------- inbox: shared uploads and figures waiting for this desk
  let uploads = [], inbox = [];
  async function loadInbox() {
    try {
      const [u, f] = await Promise.all([ctx.db.collection('_puploads').get(), ctx.db.collection('_pinbox').get()]);
      uploads = u.docs.map(d => ({ ...d.data(), _id: d.id }));
      inbox = f.docs.map(d => ({ ...d.data(), _id: d.id }));
    } catch {}
    renderPanel();
    setTimeout(loadInbox, 60000);
  }
  async function fileOf(u) {
    const r = await fetch(u.url); if (!r.ok) throw new Error('The file could not be fetched (' + r.status + ')');
    const b = await r.blob(); return new File([b], u.name || 'upload.xlsx', { type: b.type || u.type || '' });
  }
  function feedInput(sel, file) {
    const inp = document.querySelector(sel); if (!inp) throw new Error('This desk has no import button here');
    const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function importUpload(u) {
    const how = u.target, file = await fileOf(u);
    switch (ctx.tool) {
      case 'gst': { const ui = G('ui'); if (ui && how && how !== 'file') ui.impKind = how; await G('readFiles')([file]); break; }
      case 'tds': case 'depreciation': feedInput('#import-file', file); break;
      case 'financial-analysis': feedInput('#fin-file', file); break;
      case 'remittance': await G('importFile')(file); break;
      case 'internal-audit': {
        const S = G('S'), co = currentLinked();
        if (!co || co.portalId !== u.clientId) throw new Error('Open an engagement of this client first (Engagements), then import.');
        G('startUpload')(file, how); break;
      }
      default: throw new Error('This desk does not take shared uploads');
    }
    try { await ctx.db.doc(`_puploads/${u._id}`).update({ doneAt: new Date().toISOString(), doneBy: ctx.email }); u.doneAt = new Date().toISOString(); } catch {}
  }
  async function applyFigures(item, co) {
    const F = item.figures;
    if (ctx.tool === 'financial-analysis') {
      const y = co.years.find(x => String(x.label).replace(/\s+/g, '') === F.fy.replace(/\s+/g, ''));
      if (!y) throw new Error(`Add a ${F.fy} column on Financials first, then apply.`);
      Object.assign(y.v, { dep: F.dep, nfa: F.nfa, intang: F.intang });
    } else if (ctx.tool === 'cfo') {
      const B = G('activeBud')(co); if (!B) throw new Error('Create a budget first.');
      const ms = G('months')(co.settings.Y);
      const put = (k, per) => ms.forEach(mk => { B.d[mk] = B.d[mk] || { q: {}, p: {}, v: {} }; B.d[mk].v = B.d[mk].v || {}; B.d[mk].v[k] = per; });
      if (item.from === 'depreciation') put('da', r2(F.dep / 12));
      if (item.from === 'financial-analysis') { Object.assign(co.settings, { dso: Math.round(F.dso), dio: Math.round(F.dio), dpo: Math.round(F.dpo), cashAtClose: F.cash }); if (F.fc) put('fc', r2(F.fc / 12)); }
    }
    if (ctx.tool === 'financial-analysis') G('persist')(); else G('persist')(co);
    G('render')();
    try { await ctx.db.doc(`_pinbox/${item._id}`).update({ applied: new Date().toISOString(), appliedBy: ctx.email }); item.applied = new Date().toISOString(); } catch {}
  }
  const flowText = (it) => {
    const F = it.figures || {};
    if (it.from === 'depreciation' && ctx.tool === 'financial-analysis') return `Depreciation Workbench, ${F.fy}: depreciation ₹${F.dep} lakh · net fixed assets ₹${F.nfa} lakh · intangibles ₹${F.intang} lakh.`;
    if (it.from === 'depreciation' && ctx.tool === 'cfo') return `Depreciation Workbench, ${F.fy}: ₹${F.dep} lakh a year → ₹${r2(F.dep / 12)} lakh a month on the depreciation line of the active budget.`;
    if (it.from === 'financial-analysis') return `Financial Analysis, ${F.fy}: receivable ${Math.round(F.dso)} days, inventory ${Math.round(F.dio)} days, payable ${Math.round(F.dpo)} days, cash ₹${F.cash} lakh${F.fc ? `, finance cost ₹${r2(F.fc / 12)} lakh a month` : ''} → cash-forecast settings and budget.`;
    return '';
  };

  // ---------------------------------------------------------------- the panel
  let host = null, root = null, hidden = {};
  function panelMount() {
    host = document.createElement('div'); host.id = 'portal-int';
    root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    renderPanel();
  }
  function renderPanel() {
    if (!root) return;
    const co = currentLinked();
    const pid = co && co.portalId;
    const ups = pid ? uploads.filter(u => u.clientId === pid && !u.doneAt && !hidden['u' + u._id]) : [];
    const fl = pid ? inbox.filter(i => i.clientId === pid && (!i.applied || i.at > i.applied) && !hidden['f' + i._id] && flowText(i)) : [];
    if (!ups.length && !fl.length) { root.innerHTML = ''; return; }
    const when = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';
    root.innerHTML = `<style>
      :host{all:initial;position:fixed;left:max(12px,env(safe-area-inset-left));bottom:calc(58px + env(safe-area-inset-bottom));z-index:2147482999;font:13px/1.45 "Plus Jakarta Sans","Segoe UI",system-ui,sans-serif}
      @media (max-width:900px){:host{bottom:calc(122px + env(safe-area-inset-bottom))}}
      .card{width:min(380px,calc(100vw - 24px));background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 20px 44px -16px rgba(15,23,42,.45);overflow:hidden}
      .h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;background:linear-gradient(120deg,#0f172a,#0c4a6e);color:#fff;font-weight:700}
      .h span{font-size:11px;color:#7dd3fc;letter-spacing:.08em;text-transform:uppercase}
      .h button{all:unset;cursor:pointer;color:#cbd5e1;font-size:16px;padding:0 4px}
      .list{max-height:46vh;overflow:auto}
      .it{padding:11px 14px;border-top:1px solid #e2e8f0;display:grid;gap:8px}
      .it b{font-size:13px}.it .m{color:#64748b;font-size:12px}
      .row{display:flex;gap:6px;flex-wrap:wrap}
      .row button{all:unset;cursor:pointer;border-radius:9px;padding:6px 11px;font-weight:600;font-size:12.5px;border:1px solid #e2e8f0}
      .row button.p{background:#0284c7;border-color:#0284c7;color:#fff}
      .err{color:#dc2626;font-size:12px}
      :focus-visible{outline:2px solid #0284c7;outline-offset:2px}
      .min .list{display:none}
    </style>
    <div class="card" id="card"><div class="h"><div><span>Portal · ${esc(ad.name(co))}</span><div>${ups.length + fl.length} waiting for this client</div></div><button id="x" aria-label="Minimise">–</button></div><div class="list">
    ${ups.map(u => `<div class="it" data-k="u${esc(u._id)}"><b>${esc(u.kindName || 'Shared file')}: ${esc(u.name)}</b><span class="m">Uploaded ${esc(when(u.at))} by ${esc(u.by || '')} on the client dashboard</span><div class="row"><button class="p" data-imp="${esc(u._id)}">Import into this desk</button><button data-hide="u${esc(u._id)}">Later</button></div><div class="err"></div></div>`).join('')}
    ${fl.map(i => `<div class="it" data-k="f${esc(i._id)}"><b>${i.from === 'depreciation' ? 'From Depreciation Workbench' : 'From Financial Analysis'}</b><span class="m">${esc(flowText(i))}</span><div class="row"><button class="p" data-apply="${esc(i._id)}">Apply</button><button data-hide="f${esc(i._id)}">Later</button></div><div class="err"></div></div>`).join('')}
    </div></div>`;
    root.getElementById('x').onclick = () => root.getElementById('card').classList.toggle('min');
    root.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => { hidden[b.dataset.hide] = 1; renderPanel(); });
    root.querySelectorAll('[data-imp]').forEach(b => b.onclick = async () => {
      const u = uploads.find(x => x._id === b.dataset.imp), box = b.closest('.it');
      b.textContent = 'Reading…'; try { await importUpload(u); renderPanel(); } catch (e) { box.querySelector('.err').textContent = e.message || String(e); b.textContent = 'Import into this desk'; }
    });
    root.querySelectorAll('[data-apply]').forEach(b => b.onclick = async () => {
      const it = inbox.find(x => x._id === b.dataset.apply), box = b.closest('.it');
      try { await applyFigures(it, currentLinked()); renderPanel(); } catch (e) { box.querySelector('.err').textContent = e.message || String(e); }
    });
  }

  window.PortalIntegrate = { before, after };
})();
