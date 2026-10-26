/* Bhayani & Co portal — shared client: Supabase session, profile, access, and the sign-in / set-password screens used by /login and /admin. */
(function () {
  const P = window.PORTAL;
  const sb = window.supabase.createClient(P.supabaseUrl, P.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bhayani-portal-auth' } });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r = document) => r.querySelector(s);

  const Portal = {
    sb, esc, $,
    tools: P.tools,
    tool: slug => P.tools.find(t => t.slug === slug),
    loginEmail(id) { const v = String(id || '').trim().toLowerCase(); return P.aliases[v] || v; },
    isAdmin: p => !!p && (p.role === 'admin' || p.role === 'superadmin'),
    roleLabel: r => ({ superadmin: 'Super Admin', admin: 'Admin', user: 'User' })[r] || r,
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async profile() {
      const s = await this.session(); if (!s) return null;
      const { data } = await sb.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
      return data;
    },
    async myAccess(uid) { const { data } = await sb.from('access').select('*').eq('user_id', uid); return data || []; },
    async firm() {
      try { const { data } = await sb.from('settings').select('value').eq('key', 'public.firm').maybeSingle(); return (data && data.value) || { name: 'Bhayani & Co.', tagline: 'Chartered Accountants' }; }
      catch { return { name: 'Bhayani & Co.', tagline: 'Chartered Accountants' }; }
    },
    async signOut() { try { await sb.auth.signOut(); } catch {} },
    toast(msg, bad) {
      let t = $('#p-toast'); if (!t) { t = document.createElement('div'); t.id = 'p-toast'; t.className = 'p-toast'; document.body.appendChild(t); }
      t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 4200);
    },
    errText(e) {
      const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Something went wrong');
      if (/Invalid login credentials/i.test(m)) return 'Login ID or password is not correct.';
      if (/banned|disabled/i.test(m)) return 'This account is switched off. Please contact the administrator.';
      if (/Failed to fetch|NetworkError/i.test(m)) return 'Cannot reach the server. Check your internet connection and try again.';
      if (/same_password|should be different/i.test(m)) return 'The new password must be different from the old one.';
      return m.replace(/^.*?exception:\s*/i, '');
    },

    /* Sign-in flow. mode: 'user' (/login) or 'admin' (/admin). Calls onReady(profile) once signed in with a personal password. */
    async gate(root, mode, onReady) {
      const firm = await this.firm();
      const self = this;
      const card = (inner) => {
        root.innerHTML = `<div class="p-auth"><div class="p-auth-card">
          <div class="p-brand"><div class="p-mark" aria-hidden="true">${esc((firm.name || 'B').trim()[0])}</div>
          <div><div class="p-brand-name">${esc(firm.name || 'Bhayani & Co.')}</div><div class="p-brand-sub">${mode === 'admin' ? 'Admin portal' : 'Client & staff portal'}</div></div></div>
          ${inner}</div>
          <p class="p-auth-foot">${mode === 'admin' ? '<a href="/login/">Staff login</a>' : '<a href="/">Back to website</a>'}</p></div>`;
      };
      const showLogin = (msg) => {
        card(`<h1>${mode === 'admin' ? 'Admin sign in' : 'Sign in'}</h1>
          <form id="p-login" class="p-form" novalidate>
            <label>Login ID<input id="p-id" type="text" autocomplete="username" placeholder="${mode === 'admin' ? 'admin@123' : 'your email address'}" required></label>
            <label>Password<input id="p-pw" type="password" autocomplete="current-password" required></label>
            <div class="p-err" role="alert">${esc(msg || '')}</div>
            <button class="p-btn primary" type="submit">Sign in</button>
          </form>
          <p class="p-hint">First time? Your password is the one your administrator gave you; you will set your own right after.</p>`);
        $('#p-id').focus();
        $('#p-login').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const btn = ev.submitter || $('#p-login button'); btn.disabled = true; btn.textContent = 'Signing in…';
          const { error } = await sb.auth.signInWithPassword({ email: self.loginEmail($('#p-id').value), password: $('#p-pw').value });
          if (error) { showLogin(self.errText(error)); return; }
          route(true);
        });
      };
      const showSetPassword = (p, msg) => {
        card(`<h1>Set your password</h1>
          <p class="p-sub">Hello ${esc(p.name || p.email)}. For your security, choose a new password before you continue.</p>
          <form id="p-setpw" class="p-form" novalidate>
            <label>New password<input id="p-n1" type="password" autocomplete="new-password" minlength="8" required></label>
            <label>Type it again<input id="p-n2" type="password" autocomplete="new-password" minlength="8" required></label>
            <ul class="p-rules"><li>At least 8 characters</li><li>Not the same as the first-time password</li></ul>
            <div class="p-err" role="alert">${esc(msg || '')}</div>
            <button class="p-btn primary" type="submit">Save password and continue</button>
            <button class="p-btn ghost" type="button" id="p-out">Sign out</button>
          </form>`);
        $('#p-n1').focus();
        $('#p-out').onclick = async () => { await self.signOut(); showLogin(); };
        $('#p-setpw').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const a = $('#p-n1').value, b = $('#p-n2').value;
          if (a.length < 8) return showSetPassword(p, 'Use at least 8 characters.');
          if (a !== b) return showSetPassword(p, 'The two passwords do not match.');
          if (a === P.defaultPassword) return showSetPassword(p, 'Choose a password different from the first-time one.');
          const btn = $('#p-setpw button[type=submit]'); btn.disabled = true; btn.textContent = 'Saving…';
          const { error } = await sb.auth.updateUser({ password: a });
          if (error) return showSetPassword(p, self.errText(error));
          await sb.rpc('password_changed');
          self.toast('Password saved');
          route(false);
        });
      };
      const route = async (fresh) => {
        const s = await self.session();
        if (!s) return showLogin();
        const p = await self.profile();
        if (!p) { await self.signOut(); return showLogin('This login has no portal account. Please contact the administrator.'); }
        if (!p.active) { await self.signOut(); return showLogin('This account is switched off. Please contact the administrator.'); }
        if (fresh) { try { await sb.rpc('touch_login'); } catch {} }
        if (p.must_change_pw) return showSetPassword(p);
        if (mode === 'admin' && !self.isAdmin(p)) { root.innerHTML = ''; card(`<h1>Admins only</h1><p class="p-sub">You are signed in as ${esc(p.email)}, which is not an admin account.</p><div class="p-row"><a class="p-btn primary" href="/login/">Go to my tools</a><button class="p-btn ghost" id="p-out">Sign out</button></div>`); $('#p-out').onclick = async () => { await self.signOut(); showLogin(); }; return; }
        onReady(p);
      };
      route(false);
    },

    /* Change-password dialog for signed-in people */
    changePasswordDialog() {
      const d = document.createElement('dialog'); d.className = 'p-dialog';
      d.innerHTML = `<form class="p-form" method="dialog" novalidate><h2>Change password</h2>
        <label>New password<input id="cp1" type="password" autocomplete="new-password" minlength="8"></label>
        <label>Type it again<input id="cp2" type="password" autocomplete="new-password" minlength="8"></label>
        <div class="p-err" role="alert"></div>
        <div class="p-row end"><button class="p-btn ghost" value="cancel" formnovalidate>Cancel</button><button class="p-btn primary" id="cp-save" type="button">Save</button></div></form>`;
      document.body.appendChild(d); d.showModal();
      d.addEventListener('close', () => d.remove());
      $('#cp-save', d).onclick = async () => {
        const a = $('#cp1', d).value, b = $('#cp2', d).value, err = $('.p-err', d);
        if (a.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
        if (a !== b) { err.textContent = 'The two passwords do not match.'; return; }
        if (a === P.defaultPassword) { err.textContent = 'Choose a password different from the first-time one.'; return; }
        const { error } = await sb.auth.updateUser({ password: a });
        if (error) { err.textContent = this.errText(error); return; }
        await sb.rpc('password_changed'); d.close(); this.toast('Password changed');
      };
    },
  };
  window.Portal = Portal;
})();
