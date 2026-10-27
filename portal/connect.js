/* Bhayani & Co portal — connects a desk to the portal.
   1. Sign-in guard: only signed-in people with access to this tool get in (others go to /login).
   2. Section permissions: sections the admin has not given are hidden and cannot be opened.
   3. Storage: provides the same window.claude.use('db' | 'user' | 'assets') the desks were built on, backed by the
      firm's Supabase database, so work is saved centrally. Features that only exist inside Claude (Outlook
      connector, Claude AI) report "not available" and the desks fall back on their own. */
(function () {
  'use strict';
  const CFG = window.PORTAL;
  const script = document.currentScript;
  const TOOL = script && script.dataset.tool;
  const META = CFG.tools.find(t => t.slug === TOOL) || { name: TOOL, sections: {} };
  const SHARED_ID = 'firm';                       // desks that keep "my companies" under data/users/<id> share one firm workspace
  const PER_PERSON = TOOL === 'society';          // Society Desk needs each person's real identity (house links, votes)

  // per-path access rules (same meaning as in the desk's original design) — Society Desk only
  const RULES = {
    society: [
      ['config', 'view', 'admin'], ['members', 'view', 'admin'], ['houses', 'admin', 'admin'], ['vehicles', 'view', 'admin'], ['bills', 'view', 'admin'], ['ledger', 'view', 'admin'],
      ['events', 'view', 'admin'], ['meetings', 'view', 'admin'], ['notices', 'view', 'admin'], ['amenities', 'view', 'admin'], ['tournaments', 'view', 'admin'], ['polls', 'view', 'admin'],
      ['audits', 'view', 'admin'], ['staff', 'interact', 'admin'], ['gateContacts', 'interact', 'admin'], ['blocklist', 'interact', 'admin'], ['verifications', 'interact', 'admin'],
      ['bookings', 'view', 'interact'], ['sportsRegs', 'view', 'interact'], ['visitors', 'interact', 'interact'], ['gateRequests', 'interact', 'interact'], ['passes', 'interact', 'interact'],
      ['housePrefs', 'interact', 'interact'], ['payClaims', 'interact', 'interact'], ['complaints', 'view', 'interact'], ['gallery', 'view', 'interact'],
      ['votes', 'admin', 'admin'], ['votes/{self}', 'interact', 'interact'], ['houseLinks', 'admin', 'admin'], ['houseLinks/{self}', 'interact', 'interact'],
    ],
  }[TOOL] || [];
  const RANK = { view: 1, interact: 2, admin: 3, owner: 4 };

  // keep the page hidden until access is confirmed
  const veil = document.createElement('style'); veil.textContent = 'html{visibility:hidden!important}';
  document.head.appendChild(veil);

  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bhayani-portal-auth' } });
  const S = { uid: null, profile: null, level: null, sections: null, rank: 0, admin: false, warnedRO: false };
  let readyResolve; const ready = new Promise(r => { readyResolve = r; });          // the desk may start (after set-up)
  let authResolve; const authed = new Promise(r => { authResolve = r; });          // signed in and allowed: storage calls may run
  const go = url => { location.replace(url); return new Promise(() => {}); };
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
  const err = (code, message) => { const e = new Error(message); e.code = code; return e; };

  // ---------------------------------------------------------------- sign-in and access
  async function init() {
    let session;
    try { ({ data: { session } } = await sb.auth.getSession()); } catch { return offline(); }
    if (!session) return go(`/login/?next=/${TOOL}/`);
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error) return offline();
    if (!profile || !profile.active || profile.must_change_pw) return go(`/login/?next=/${TOOL}/`);
    S.uid = profile.id; S.profile = profile; S.admin = profile.role === 'admin' || profile.role === 'superadmin';
    if (S.admin) { S.level = 'admin'; S.sections = null; }
    else {
      const { data: a } = await sb.from('access').select('*').eq('user_id', profile.id).eq('tool', TOOL).maybeSingle();
      if (!a) return go('/login/?why=noaccess');
      S.level = a.level; S.sections = a.sections;
    }
    S.rank = S.admin ? (profile.role === 'superadmin' ? RANK.owner : RANK.owner) : S.level === 'admin' ? RANK.admin : S.level === 'use' ? RANK.interact : RANK.view;
    applySections();
    veil.remove();
    badge();
    sb.from('activity').insert({ user_id: S.uid, email: profile.email, action: 'tool.open', detail: META.name }).then(() => {}, () => {});
    if (TOOL === 'society' && S.admin) { try { await seedSociety(); } catch (e) { console.warn('society seed', e); } }
    authResolve(true);
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));   // every page script (desk + integration) has run
    const I = window.PortalIntegrate, ictx = { tool: TOOL, db, sb, level: S.level, uid: S.uid, email: profile.email, admin: S.admin };
    if (I) { try { await I.before(ictx); } catch (e) { console.warn('portal integrate', e); } }
    readyResolve(true);
    if (I) I.after(ictx).catch(e => console.warn('portal integrate', e));
  }
  // Society Desk carries the firm's own society records (Rajshree Heights). The first time an admin opens it
  // and no society is set up online yet, those records become the online starting point.
  async function seedSociety() {
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
    let seed; try { seed = eval('typeof SEED !== "undefined" ? SEED : null'); } catch { seed = null; }
    if (!seed || !seed.cfg) return;
    const { data, error } = await sb.from('docs').select('path').eq('tool', 'society').eq('path', 'config/society').maybeSingle();
    if (error || data) return;
    const rows = [{ tool: 'society', path: 'config/society', parent: 'config', doc_id: 'society', data: seed.cfg, updated_by: S.uid }]
      .concat((seed.audits || []).map(a => ({ tool: 'society', path: 'audits/fy' + a.fy, parent: 'audits', doc_id: 'fy' + a.fy, data: a, updated_by: S.uid })));
    const { error: e2 } = await sb.from('docs').upsert(rows, { onConflict: 'tool,path', ignoreDuplicates: true });
    if (!e2) sb.from('activity').insert({ user_id: S.uid, email: S.profile.email, action: 'settings.update', detail: 'Society Desk: loaded ' + seed.cfg.name + ' starting records' }).then(() => {}, () => {});
  }
  function offline() {
    veil.remove();
    document.body.innerHTML = `<div style="font:15px system-ui;max-width:460px;margin:12vh auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;text-align:center">
      <h2 style="margin:0 0 8px">Cannot reach the server</h2><p style="color:#64748b">Check your internet connection, then try again.</p>
      <button onclick="location.reload()" style="padding:9px 16px;border-radius:10px;border:0;background:#0284c7;color:#fff;font-weight:600;cursor:pointer">Try again</button></div>`;
    return new Promise(() => {});
  }

  // ---------------------------------------------------------------- section permissions
  function applySections() {
    if (!S.sections) return;
    const allowed = new Set(S.sections);
    const all = Object.keys(META.sections || {});
    const blocked = all.filter(k => !allowed.has(k));
    if (!blocked.length) return;
    const sel = k => `[data-nav="${k}"],[data-tab="${k}"]`;
    const st = document.createElement('style');
    st.textContent = blocked.map(sel).join(',') + '{display:none!important}';
    document.head.appendChild(st);
    const isBlocked = el => { const k = el && (el.dataset.nav || el.dataset.tab); return !!k && blocked.includes(k); };
    // stop any click (menu, link button, keyboard) that would open a hidden section
    ['click', 'keydown'].forEach(type => document.addEventListener(type, e => {
      if (type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target && e.target.closest && e.target.closest('[data-nav],[data-tab]');
      if (el && isBlocked(el)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true));
    // if a hidden section is the one on screen (first load, remembered tab), move to the first allowed one
    let busy = false;
    const st2 = document.createElement('style'); st2.textContent = '[data-portal-empty]{display:none!important}'; document.head.appendChild(st2);
    const tidyGroups = () => {
      // a menu group whose every entry is hidden: hide the group and its heading too
      const parents = new Set([...document.querySelectorAll('[data-nav],[data-tab]')].map(el => el.parentElement).filter(Boolean));
      parents.forEach(par => {
        const items = [...par.children].filter(c => c.matches('[data-nav],[data-tab]'));
        const empty = items.length > 0 && items.every(isBlocked);
        const heading = (n) => n && !n.matches('[data-nav],[data-tab]') && !n.querySelector('button,a,input,select') && (n.textContent || '').trim().length < 40 && n.children.length === 0;
        const labelInside = [...par.children].filter(c => !c.matches('[data-nav],[data-tab]') && heading(c));
        if (empty) {
          if (labelInside.length && items.length + labelInside.length === par.children.length) par.setAttribute('data-portal-empty', '');
          else if (!labelInside.length && heading(par.previousElementSibling)) { par.setAttribute('data-portal-empty', ''); par.previousElementSibling.setAttribute('data-portal-empty', ''); }
          else if (!labelInside.length && items.length === par.children.length) par.setAttribute('data-portal-empty', '');
        }
      });
    };
    const fix = () => {
      if (busy) return; busy = true;
      requestAnimationFrame(() => {
        busy = false; tidyGroups();
        const cur = document.querySelector('[data-nav][aria-current="page"],[data-tab][aria-current="page"],[data-nav][aria-selected="true"],[data-tab][aria-selected="true"],[data-tab].active,[data-nav].active');
        if (cur && isBlocked(cur)) {
          const first = [...document.querySelectorAll('[data-nav],[data-tab]')].find(el => !isBlocked(el) && allowed.has(el.dataset.nav || el.dataset.tab));
          if (first) first.click();
        }
      });
    };
    new MutationObserver(fix).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'aria-selected', 'class'] });
    document.addEventListener('DOMContentLoaded', fix);
  }

  // ---------------------------------------------------------------- small portal button on every desk
  function badge() {
    const mount = () => {
      const host = document.createElement('div');
      host.id = 'portal-badge';
      const root = host.attachShadow({ mode: 'open' });
      const p = S.profile, ro = S.level === 'view';
      root.innerHTML = `<style>
        :host{all:initial;position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;font:13px/1.4 "Plus Jakarta Sans","Segoe UI",system-ui,sans-serif}
        @media (max-width:900px){:host{bottom:calc(76px + env(safe-area-inset-bottom))}}
        button,a{font:inherit}
        .pill{display:flex;align-items:center;gap:8px;background:#0f172a;color:#f8fafc;border:1px solid rgba(255,255,255,.15);border-radius:999px;padding:5px;cursor:pointer;box-shadow:0 8px 24px -8px rgba(15,23,42,.5);opacity:.85}
        .pill .t{display:none}
        .pill:hover,.pill:focus-visible,.pill[aria-expanded=true]{opacity:1;padding-right:12px}
        .pill:hover .t,.pill:focus-visible .t,.pill[aria-expanded=true] .t{display:inline}
        .pill .ro{margin-right:4px}
        .m{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#0c4a6e);display:grid;place-items:center;font-weight:800;font-size:12px}
        .ro{background:#fbbf24;color:#1c1300;border-radius:999px;padding:0 7px;font-size:11px;font-weight:700}
        .menu{position:absolute;left:0;bottom:calc(100% + 8px);min-width:230px;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 20px 40px -12px rgba(15,23,42,.35);padding:6px;display:grid}
        .menu[hidden]{display:none}
        .who{padding:8px 10px 10px;border-bottom:1px solid #e2e8f0;margin-bottom:4px}
        .who b{display:block;font-size:13px}.who span{color:#64748b;font-size:12px}
        .menu a,.menu button{all:unset;cursor:pointer;padding:8px 10px;border-radius:9px;font-size:13px}
        .menu a:hover,.menu button:hover{background:#f1f5f9}
        :focus-visible{outline:2px solid #0284c7;outline-offset:2px}
      </style>
      <div class="menu" id="menu" hidden role="menu">
        <div class="who"><b></b><span></span></div>
        <a href="/login/" role="menuitem">All my tools</a>
        ${S.admin ? '<a href="/admin/" role="menuitem">Admin portal</a>' : ''}
        <button type="button" id="out" role="menuitem">Sign out</button>
      </div>
      <button class="pill" id="pill" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="menu"><span class="m" aria-hidden="true"></span><span class="t">Portal</span>${ro ? '<span class="ro">View only</span>' : ''}</button>`;
      root.querySelector('.who b').textContent = p.name || p.email;
      root.querySelector('.who span').textContent = `${META.name} · ${({ view: 'View only', use: 'Can edit', admin: 'Full control' })[S.level]}`;
      root.querySelector('.m').textContent = (p.name || p.email || '?').trim()[0].toUpperCase();
      const pill = root.getElementById('pill'), menu = root.getElementById('menu');
      pill.onclick = () => { const open = menu.hidden; menu.hidden = !open; pill.setAttribute('aria-expanded', String(open)); };
      document.addEventListener('click', e => { if (!host.contains(e.target)) { menu.hidden = true; pill.setAttribute('aria-expanded', 'false'); } });
      root.getElementById('out').onclick = async () => { try { await sb.auth.signOut(); } catch {} location.href = '/login/'; };
      document.body.appendChild(host);
    };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  }
  function note(msg) {
    let t = document.getElementById('portal-note');
    if (!t) { t = document.createElement('div'); t.id = 'portal-note'; t.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483001;background:#b45309;color:#fff;padding:10px 16px;border-radius:10px;font:600 13px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:calc(100vw - 32px)'; document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 5000);
  }

  // ---------------------------------------------------------------- identity
  const myId = () => PER_PERSON ? S.uid : SHARED_ID;
  const COLORS = ['#0284c7', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#be185d'];
  const colorOf = id => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const avatar = (name, id) => {
    const ini = (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="${colorOf(id)}"/><text x="32" y="40" font-family="sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${ini.replace(/[<&>]/g, '')}</text></svg>`);
  };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const nameCache = {};
  const profileOf = (id, row) => ({ id, name: row ? row.name || row.email || '' : (id === SHARED_ID ? (S.profile.name || '') : ''), avatarUrl: avatar(row ? row.name || row.email : '', id), color: colorOf(id), email: row ? row.email : null, isMe: id === myId(), guest: false });
  const userCap = {
    isOwner: async () => S.admin,
    canEdit: async () => S.level === 'admin',
    can: async n => n === 'data.write' ? S.level !== 'view' : (n === 'files.write' || n === 'assets.write') ? S.level === 'admin' : n === 'people.add' ? false : false,
    id: async () => myId(),
    me: async () => ({ id: myId(), name: S.profile.name || '', avatarUrl: avatar(S.profile.name || S.profile.email, myId()), color: colorOf(myId()), email: S.profile.email, isOwner: S.admin, canEdit: S.level === 'admin' }),
    name: async () => S.profile.name || '',
    email: async () => S.profile.email,
    avatarUrl: async () => avatar(S.profile.name || S.profile.email, myId()),
    async profiles(ids) {
      ids = [...new Set([].concat(ids || []))];
      const need = ids.filter(id => UUID.test(id) && !(id in nameCache));
      if (need.length) { try { const { data } = await sb.rpc('user_names', { p_ids: need }); (data || []).forEach(r => { nameCache[r.id] = r; }); need.forEach(id => { if (!(id in nameCache)) nameCache[id] = null; }); } catch {} }
      return Object.fromEntries(ids.map(id => [id, profileOf(id, nameCache[id] || (id === S.uid ? S.profile : null))]));
    },
    async search(q) {
      try { const { data } = await sb.rpc('search_users', { q: String(q || '') }); (data || []).forEach(r => { nameCache[r.id] = r; }); return (data || []).filter(r => r.name || r.email).map(r => ({ ...profileOf(r.id, r), name: r.name || r.email })); }
      catch { return []; }
    },
  };

  // ---------------------------------------------------------------- path rules
  const segs = p => String(p).split('/').filter(Boolean);
  function needLevel(path, action) {
    let read = 'view', write = 'interact';
    const s = segs(path);
    if (s[0] === 'data' && s[1] === 'users' && s.length > 2 && s[2] !== myId()) return 'never';
    for (let d = 1; d <= s.length; d++) {
      const prefix = s.slice(0, d).join('/');
      for (const [rp, r, w] of RULES) {
        if (rp === prefix || (rp.endsWith('/{self}') && d >= 2 && s.slice(0, d - 1).join('/') === rp.slice(0, -7) && s[d - 1] === myId() && d === segs(rp).length)) {
          read = r; write = RANK[w] < RANK[r] ? r : w;
        }
      }
    }
    return action === 'read' ? read : write;
  }
  const canRead = path => { const n = needLevel(path, 'read'); return n !== 'never' && S.rank >= RANK[n]; };
  const canWrite = path => { const n = needLevel(path, 'write'); return n !== 'never' && S.rank >= RANK[n] && S.level !== 'view'; };

  // ---------------------------------------------------------------- the database
  const parentOf = path => segs(path).slice(0, -1).join('/');
  const lastOf = path => { const s = segs(path); return s[s.length - 1]; };
  const checkDoc = p => { const n = segs(p).length; if (!n || n % 2) throw new TypeError(`Document path needs an even number of segments: "${p}" has ${n}`); return segs(p).join('/'); };
  const checkCol = p => { const n = segs(p).length; if (!n || !(n % 2)) throw new TypeError(`Collection path needs an odd number of segments: "${p}" has ${n}`); return segs(p).join('/'); };
  const dbErr = e => {
    const m = (e && e.message) || String(e);
    if (/row-level security|permission|42501/i.test(m) || (e && e.code === '42501')) return err('invalid_argument', 'You do not have permission to change this.');
    if (/JWT|expired|401/i.test(m)) { location.href = `/login/?next=/${TOOL}/`; return err('revoked', 'Signed out'); }
    if (/Failed to fetch|NetworkError|timeout/i.test(m)) return err('unavailable', 'Cannot reach the server');
    return err('unavailable', m);
  };
  const snapDoc = (path, data) => ({ id: lastOf(path), exists: data !== undefined, data: () => clone(data), metadata: { fromCache: false, hasPendingWrites: false } });

  // reads of single documents are grouped into one request
  let getQ = [], getT = null;
  function fetchDoc(path) {
    return new Promise((resolve, reject) => {
      getQ.push({ path, resolve, reject });
      if (!getT) getT = setTimeout(flushGets, 8);
    });
  }
  async function flushGets() {
    const q = getQ; getQ = []; getT = null;
    const paths = [...new Set(q.map(x => x.path))];
    const found = {};
    try {
      for (let i = 0; i < paths.length; i += 40) {
        const { data, error } = await sb.from('docs').select('path,data').eq('tool', TOOL).in('path', paths.slice(i, i + 40));
        if (error) throw error;
        (data || []).forEach(r => { found[r.path] = r.data; });
      }
      q.forEach(x => x.resolve(found[x.path]));
    } catch (e) { const er = dbErr(e); q.forEach(x => x.reject(er)); }
  }
  async function fetchCol(path) {
    const out = []; let from = 0;
    for (;;) {
      const { data, error } = await sb.from('docs').select('doc_id,path,data').eq('tool', TOOL).eq('parent', path).order('doc_id').range(from, from + 999);
      if (error) throw dbErr(error);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    return out.filter(r => canRead(r.path));
  }
  // writes of whole documents are grouped too
  let setQ = [], setT = null;
  function writeDoc(path, data) {
    return new Promise((resolve, reject) => {
      setQ = setQ.filter(x => { if (x.path === path) { x.superseded = true; x.resolve(); return false; } return true; });
      setQ.push({ path, data, resolve, reject });
      if (!setT) setT = setTimeout(flushSets, 15);
    });
  }
  async function flushSets() {
    const q = setQ; setQ = []; setT = null;
    const now = new Date().toISOString();
    try {
      for (let i = 0; i < q.length; i += 25) {
        const rows = q.slice(i, i + 25).map(x => ({ tool: TOOL, path: x.path, parent: parentOf(x.path), doc_id: lastOf(x.path), data: x.data, updated_at: now, updated_by: S.uid }));
        const { error } = await sb.from('docs').upsert(rows, { onConflict: 'tool,path' });
        if (error) throw error;
      }
      q.forEach(x => x.resolve());
      touched(q.map(x => x.path));
    } catch (e) { const er = dbErr(e); if (er.code === 'invalid_argument' && !S.warnedRO) { S.warnedRO = true; note(S.level === 'view' ? 'You have view-only access to this tool — changes are not saved.' : 'You do not have permission to change this part of the tool.'); } q.forEach(x => x.reject(er)); }
  }
  function denyWrite() {
    if (!S.warnedRO) { S.warnedRO = true; note(S.level === 'view' ? 'You have view-only access to this tool — changes are not saved.' : 'You do not have permission to change this part of the tool.'); }
    return Promise.reject(err('invalid_argument', 'Not allowed to write here'));
  }
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(o[k]) ? merge(o[k], v) : clone(v); return o; };

  // live updates: poll what is being watched, and refresh at once after this page writes
  const watchers = new Set();
  let pollT = null;
  function touched(paths) { const ps = new Set(paths.map(parentOf)); watchers.forEach(w => { if (w.kind === 'doc' ? paths.includes(w.path) : ps.has(w.path)) w.refresh(); }); }
  function startPoll() { if (pollT) return; pollT = setInterval(() => { if (document.visibilityState === 'visible') watchers.forEach(w => w.refresh()); }, 15000); }

  function makeQuery(path, filters = [], order = null, lim = null) {
    const apply = rows => {
      let docs = rows.map(r => ({ id: r.doc_id, path: r.path, data: r.data }));
      for (const [f, op, v] of filters) docs = docs.filter(d => { const x = d.data ? d.data[f] : undefined;
        switch (op) { case '==': return x === v; case '!=': return x !== v && x !== undefined; case '<': return x < v; case '<=': return x <= v; case '>': return x > v; case '>=': return x >= v;
          case 'in': return (v || []).includes(x); case 'not-in': return x !== undefined && !(v || []).includes(x); case 'array-contains': return Array.isArray(x) && x.includes(v); default: return true; } });
      if (order) { const [f, dir] = order, s = dir === 'desc' ? -1 : 1; docs.sort((a, b) => { const x = a.data[f], y = b.data[f]; if (x === undefined && y === undefined) return 0; if (x === undefined) return 1; if (y === undefined) return -1; return x < y ? -s : x > y ? s : 0; }); }
      if (lim) docs = docs.slice(0, lim);
      return docs;
    };
    const qsnap = (docs, prev) => {
      const ds = docs.map(d => snapDoc(d.path, d.data));
      const prevMap = prev ? new Map(prev.map((d, i) => [d.id, { d, i }])) : new Map();
      return { docs: ds, size: ds.length, empty: !ds.length, metadata: { fromCache: false, hasPendingWrites: false },
        docChanges() {
          const out = [], seen = new Set();
          docs.forEach((d, i) => { const p = prevMap.get(d.id); seen.add(d.id); if (!p) out.push({ type: 'added', doc: ds[i], oldIndex: -1, newIndex: i }); else if (JSON.stringify(p.d.data) !== JSON.stringify(d.data) || p.i !== i) out.push({ type: 'modified', doc: ds[i], oldIndex: p.i, newIndex: i }); });
          prevMap.forEach((p, id) => { if (!seen.has(id)) out.push({ type: 'removed', doc: snapDoc(p.d.path, p.d.data), oldIndex: p.i, newIndex: -1 }); });
          return out;
        } };
    };
    const q = {
      where: (f, op, v) => makeQuery(path, [...filters, [f, op, v]], order, lim),
      orderBy: (f, dir = 'asc') => makeQuery(path, filters, [f, dir], lim),
      limit: n => makeQuery(path, filters, order, n),
      async get() { await authed; return qsnap(apply(await fetchCol(path))); },
      onSnapshot(next, onErr) {
        let last = null, lastKey = '', dead = false;
        const w = { kind: 'col', path, refresh: async () => {
          if (dead) return;
          try { const docs = apply(await fetchCol(path)); const key = JSON.stringify(docs); if (key === lastKey) return; lastKey = key; const s = qsnap(docs, last); last = docs; next(s); }
          catch (e) { if (e.code === 'revoked' || e.code === 'invalid_argument') { dead = true; watchers.delete(w); onErr ? onErr(e) : console.error(e); } }
        } };
        authed.then(() => { if (dead) return; watchers.add(w); startPoll(); w.refresh(); });
        return () => { dead = true; watchers.delete(w); };
      },
    };
    return q;
  }
  function docRef(path) {
    path = checkDoc(path);
    return {
      id: lastOf(path), path,
      async get() { await authed; if (!canRead(path)) return snapDoc(path, undefined); return snapDoc(path, await fetchDoc(path)); },
      async set(data) { await authed; if (!isObj(data)) throw err('invalid_argument', 'Document body must be an object'); if (!canWrite(path)) return denyWrite(); return writeDoc(path, clone(data)); },
      async update(data) {
        await authed; if (!canWrite(path)) return denyWrite();
        const cur = await fetchDoc(path); if (cur === undefined) throw err('invalid_argument', 'Document does not exist');
        return writeDoc(path, merge(cur, data));
      },
      async delete() {
        await authed; if (!canWrite(path)) return denyWrite();
        const { error } = await sb.from('docs').delete().eq('tool', TOOL).eq('path', path);
        if (error) throw dbErr(error); touched([path]);
      },
      async acquire(opts) { await authed; return { acquired: true, version: Date.now(), expiresAt: new Date(Date.now() + ((opts && opts.ttlMs) || 30000)).toISOString(), holder: opts && opts.holder }; },
      onSnapshot(next, onErr) {
        let lastKey = null, dead = false;
        const w = { kind: 'doc', path, refresh: async () => {
          if (dead) return;
          try { const d = canRead(path) ? await fetchDoc(path) : undefined; const key = JSON.stringify(d === undefined ? null : d); if (key === lastKey) return; lastKey = key; next(snapDoc(path, d)); }
          catch (e) { if (e.code === 'revoked') { dead = true; watchers.delete(w); onErr ? onErr(e) : console.error(e); } }
        } };
        authed.then(() => { if (dead) return; watchers.add(w); startPoll(); w.refresh(); });
        return () => { dead = true; watchers.delete(w); };
      },
      collection: sub => colRef(path + '/' + sub),
    };
  }
  function colRef(path) {
    path = checkCol(path);
    const q = makeQuery(path);
    return Object.assign(q, {
      path,
      doc: id => docRef(path + '/' + (id || rid())),
      async add(data) { const r = docRef(path + '/' + rid()); await r.set(data); return r; },
    });
  }
  const db = Object.freeze({ doc: docRef, collection: colRef });

  // ---------------------------------------------------------------- file uploads
  const assets = Object.freeze({
    async upload(blob) {
      await authed; if (S.level === 'view') return denyWrite();
      const name = (blob && blob.name ? blob.name : 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
      const key = `${TOOL}/${rid()}${rid()}-${name}`;
      const { error } = await sb.storage.from('files').upload(key, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
      if (error) throw dbErr(error);
      const { data } = sb.storage.from('files').getPublicUrl(key);
      return { id: key, url: data.publicUrl, sizeBytes: blob.size || 0, contentType: blob.type || '' };
    },
    async list() { await authed; const { data } = await sb.storage.from('files').list(TOOL, { limit: 1000 }); return { assets: (data || []).map(f => ({ id: `${TOOL}/${f.name}`, url: sb.storage.from('files').getPublicUrl(`${TOOL}/${f.name}`).data.publicUrl, sizeBytes: (f.metadata || {}).size || 0, contentType: (f.metadata || {}).mimetype || '' })), usage: {} }; },
    async delete(id) { await authed; const { error } = await sb.storage.from('files').remove([id]); if (error) throw dbErr(error); },
  });

  // ---------------------------------------------------------------- what the desks call
  const caps = { db, user: Object.freeze(userCap), assets };
  window.claude = Object.freeze({ use: name => ready.then(() => caps[name] || null) });
  window.__portal = { tool: TOOL, state: S };
  init();
})();
