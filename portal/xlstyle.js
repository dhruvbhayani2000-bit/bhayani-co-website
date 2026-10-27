/* Bhayani & Co portal — house style for every Excel file the desks produce (reports and templates).
   Wraps XLSX.write / XLSX.writeFile so each workbook gets, before it is saved:
   - a "Summary" dashboard sheet first (reports only): firm, desk, client, date, the headline figures shown on screen,
     and a contents table with row counts and column totals for every sheet;
   - title rows, navy header row, banded rows, thin borders, totals rows in bold, Indian number format,
     sensible column widths and filters on the header row.
   Needs the style-capable build of the library (xlsx-js-style), loaded just before this file. */
(function () {
  'use strict';
  const X = window.XLSX;
  if (!X || !X.utils || X.__houseStyle) return;
  X.__houseStyle = true;

  const C = { navy: '1F3864', navy2: '2F4F86', sky: 'DCE8F7', band: 'F4F7FB', line: 'C9D3E3', total: 'E8EEF8', ink: '1A2233', muted: '5B6578', good: 'E3F4EA', goodInk: '1B6B3A', bad: 'FBE5E3', badInk: '9C2A22', warn: 'FFF3D6', warnInk: '8A5A00', white: 'FFFFFF' };
  const FONT = 'Calibri';
  const thin = c => ({ style: 'thin', color: { rgb: c } });
  const box = c => ({ top: thin(c), bottom: thin(c), left: thin(c), right: thin(c) });
  const INR = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
  const INR2 = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';
  const S = {
    title: { font: { name: FONT, sz: 16, bold: true, color: { rgb: C.navy } } },
    sub: { font: { name: FONT, sz: 10, italic: true, color: { rgb: C.muted } } },
    head: { font: { name: FONT, sz: 10, bold: true, color: { rgb: C.white } }, fill: { fgColor: { rgb: C.navy } }, alignment: { vertical: 'center', horizontal: 'center', wrapText: true }, border: box(C.navy2) },
    cell: (band, num, fmt) => ({ font: { name: FONT, sz: 10, color: { rgb: C.ink } }, fill: band ? { fgColor: { rgb: C.band } } : undefined, border: box(C.line), alignment: { vertical: 'top', horizontal: num ? 'right' : 'left', wrapText: !num }, numFmt: fmt }),
    total: (num, fmt) => ({ font: { name: FONT, sz: 10, bold: true, color: { rgb: C.navy } }, fill: { fgColor: { rgb: C.total } }, border: { top: { style: 'medium', color: { rgb: C.navy } }, bottom: { style: 'double', color: { rgb: C.navy } }, left: thin(C.line), right: thin(C.line) }, alignment: { horizontal: num ? 'right' : 'left' }, numFmt: fmt }),
  };
  const isNum = v => typeof v === 'number' && isFinite(v);
  const fmtFor = v => (Number.isInteger(v) ? (Math.abs(v) >= 1000 ? INR : '0') : (Math.abs(v) >= 1000 ? INR2 : '0.00'));
  const TOTAL_RE = /^(total|grand total|net total|sub-?total|closing|net (profit|loss|cash|position|tax|payable)|balance c\/?f|totals?)\b/i;
  const yearOrCode = (head, v) => /year|fy|code|hsn|sac|pin|no\.?$|number|gstin|pan|tan|month|period|qty|quantity|days|units|rate|%|age|life|count|rows/i.test(head || '') || (Number.isInteger(v) && v >= 1900 && v <= 2100);

  function aoaOf(ws) { return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }); }
  function headerRow(aoa) {
    const width = Math.max(1, ...aoa.slice(0, 40).map(r => r.filter(v => v !== null && v !== '').length));
    for (let r = 0; r < Math.min(aoa.length, 8); r++) {
      const row = aoa[r] || [], filled = row.filter(v => v !== null && v !== '');
      const strs = filled.filter(v => typeof v === 'string');
      if (filled.length >= 2 && strs.length >= Math.max(2, Math.ceil(filled.length * 0.7)) && filled.length >= Math.ceil(width * 0.5)) return r;
    }
    return -1;
  }
  function styleSheet(ws, name) {
    if (!ws || !ws['!ref'] || ws.__styled) return { rows: 0, totals: [] };
    ws.__styled = true;
    const aoa = aoaOf(ws), range = X.utils.decode_range(ws['!ref']);
    const nCols = range.e.c + 1, h = headerRow(aoa);
    const heads = h >= 0 ? (aoa[h] || []).map(v => String(v ?? '')) : [];
    const widths = Array(nCols).fill(8);
    const sums = Array(nCols).fill(0), numeric = Array(nCols).fill(0);
    let dataRows = 0;
    for (let r = 0; r <= range.e.r; r++) {
      const row = aoa[r] || [];
      const first = row.find(v => v !== null && v !== '');
      const isTotal = r > h && h >= 0 && typeof first === 'string' && TOTAL_RE.test(first.trim());
      const isTitle = h > 0 ? r < h : (r === 0 && row.filter(v => v !== null && v !== '').length === 1 && range.e.r > 0);
      if (r > h && !isTotal && row.some(v => v !== null && v !== '')) dataRows++;
      for (let c = 0; c < nCols; c++) {
        const addr = X.utils.encode_cell({ r, c }); const cell = ws[addr];
        const v = cell ? cell.v : null;
        const len = v == null ? 0 : (isNum(v) ? String(Math.round(v)).length + 3 : String(v).split('\n').reduce((m, l) => Math.max(m, l.length), 0));
        if (r >= h) widths[c] = Math.max(widths[c], Math.min(r === h ? Math.max(10, len * 0.9) : len + 2, 48));
        if (!cell) { if (r > h && h >= 0 && c < heads.length) ws[addr] = { t: 'z', v: undefined, s: isTotal ? S.total(false) : S.cell((r - h) % 2 === 0, false) }; continue; }
        if (isTitle) { cell.s = r === 0 ? S.title : S.sub; continue; }
        if (r === h) { cell.s = S.head; continue; }
        if (r < h || h < 0) { cell.s = { font: { name: FONT, sz: 10 }, numFmt: isNum(v) ? fmtFor(v) : undefined }; continue; }
        const num = isNum(v), keepPlain = num && yearOrCode(heads[c], v);
        const fmt = num ? (keepPlain ? (Number.isInteger(v) ? '0' : '0.00') : fmtFor(v)) : undefined;
        cell.s = isTotal ? S.total(num, fmt) : S.cell((r - h) % 2 === 0, num, fmt);
        if (num && !keepPlain && !isTotal) { sums[c] += v; numeric[c]++; }
      }
    }
    // a page you can read: widths, header height, filters
    ws['!cols'] = widths.map((w, i) => ({ wch: Math.max(w, (ws['!cols'] && ws['!cols'][i] && ws['!cols'][i].wch) || 0, 6) }));
    if (h >= 0) {
      ws['!rows'] = ws['!rows'] || []; ws['!rows'][h] = { hpt: 30 };
      if (dataRows > 1 && !ws['!autofilter']) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: h, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };
    }
    const totals = heads.map((hd, c) => ({ head: hd, sum: sums[c], n: numeric[c] })).filter(t => t.n >= 2 && t.head && !/rate|%|days|price|per unit|ratio|margin|age|life/i.test(t.head));
    return { rows: dataRows, totals, header: h };
  }

  // ---------------------------------------------------------------- summary dashboard (reports only)
  const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  function screenFacts() {
    const g = n => { try { return (0, eval)(n); } catch { return undefined; } };
    const cur = g('cur'); let client = '';
    if (cur) client = cur.name || (cur.settings && cur.settings.name) || '';
    if (!client) { const sel = document.querySelector('#company, #c-client'); if (sel && sel.selectedOptions[0]) client = sel.selectedOptions[0].textContent.trim(); }
    if (!client) { const S2 = g('S'); if (S2 && S2.cfg) client = S2.cfg.name || ''; }
    const tiles = [...document.querySelectorAll('.tot, .tile')].filter(e => e.offsetParent && e.querySelector('.v') && !e.closest('#portal-int'))
      .slice(0, 8).map(e => ({ k: txt(e.querySelector('.k, .eyebrow')), v: txt(e.querySelector('.v')), n: txt(e.querySelector('.n, .muted')), tone: ['bad', 'warn', 'good'].find(c => e.classList.contains(c)) || '' })).filter(t => t.k && t.v);
    const desk = (document.title || 'Report').replace(/\s*[·|-].*$/, '');
    const who = window.__portal && window.__portal.state && window.__portal.state.profile ? (window.__portal.state.profile.name || window.__portal.state.profile.email) : '';
    return { client, tiles, desk, who };
  }
  function addSummary(wb, info) {
    const f = screenFacts();
    const when = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const rows = [], styles = [], merges = [];
    const put = (r, c, v, s) => { rows[r] = rows[r] || []; rows[r][c] = v; (styles[r] = styles[r] || [])[c] = s; };
    put(0, 0, f.client || f.desk, { font: { name: FONT, sz: 18, bold: true, color: { rgb: C.white } }, fill: { fgColor: { rgb: C.navy } }, alignment: { vertical: 'center' } });
    for (let c = 1; c < 6; c++) put(0, c, '', { fill: { fgColor: { rgb: C.navy } } });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
    put(1, 0, `${f.desk} · Bhayani & Co., Chartered Accountants`, { font: { name: FONT, sz: 11, bold: true, color: { rgb: C.white } }, fill: { fgColor: { rgb: C.navy2 } } });
    for (let c = 1; c < 6; c++) put(1, c, '', { fill: { fgColor: { rgb: C.navy2 } } });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
    put(2, 0, `Prepared ${when}${f.who ? ' by ' + f.who : ''}. Figures as shown in the desk at the time of download.`, S.sub);
    let r = 4;
    if (f.tiles.length) {
      put(r, 0, 'HEADLINE FIGURES', { font: { name: FONT, sz: 10, bold: true, color: { rgb: C.muted } } }); r++;
      // tiles: two per row, label / value / note in a coloured box
      for (let i = 0; i < f.tiles.length; i += 2) {
        [f.tiles[i], f.tiles[i + 1]].forEach((t, j) => {
          if (!t) return;
          const c0 = j * 3, tone = { bad: [C.bad, C.badInk], warn: [C.warn, C.warnInk], good: [C.good, C.goodInk] }[t.tone] || [C.sky, C.navy];
          const base = { fill: { fgColor: { rgb: tone[0] } }, border: box(C.line) };
          put(r, c0, t.k.toUpperCase(), { ...base, font: { name: FONT, sz: 9, bold: true, color: { rgb: C.muted } } }); put(r, c0 + 1, '', base); put(r, c0 + 2, '', base);
          put(r + 1, c0, t.v, { ...base, font: { name: FONT, sz: 16, bold: true, color: { rgb: tone[1] } } }); put(r + 1, c0 + 1, '', base); put(r + 1, c0 + 2, '', base);
          put(r + 2, c0, t.n || '', { ...base, font: { name: FONT, sz: 9, color: { rgb: C.muted } }, alignment: { wrapText: true, vertical: 'top' } }); put(r + 2, c0 + 1, '', base); put(r + 2, c0 + 2, '', base);
          merges.push({ s: { r, c: c0 }, e: { r, c: c0 + 2 } }, { s: { r: r + 1, c: c0 }, e: { r: r + 1, c: c0 + 2 } }, { s: { r: r + 2, c: c0 }, e: { r: r + 2, c: c0 + 2 } });
        });
        r += 4;
      }
    }
    put(r, 0, 'CONTENTS', { font: { name: FONT, sz: 10, bold: true, color: { rgb: C.muted } } }); r++;
    ['Sheet', 'Rows', 'Main totals'].forEach((h, c) => put(r, c === 2 ? 2 : c, h, S.head));
    for (let c = 3; c < 6; c++) put(r, c, '', S.head);
    merges.push({ s: { r, c: 2 }, e: { r, c: 5 } }); r++;
    info.forEach((s, i) => {
      const band = i % 2 === 0, tot = s.totals.slice(0, 3).map(t => `${t.head}: ${Math.round(t.sum).toLocaleString('en-IN')}`).join('   ·   ');
      put(r, 0, s.name, { ...S.cell(band, false), font: { name: FONT, sz: 10, bold: true, color: { rgb: C.navy } } });
      put(r, 1, s.rows, S.cell(band, true, '#,##0'));
      put(r, 2, tot || '—', S.cell(band, false)); for (let c = 3; c < 6; c++) put(r, c, '', S.cell(band, false));
      merges.push({ s: { r, c: 2 }, e: { r, c: 5 } }); r++;
    });
    r++;
    put(r, 0, 'Prepared with the Bhayani & Co. desk. Check figures against source records before filing or reporting.', S.sub);
    const ws = X.utils.aoa_to_sheet(rows.map(row => Array.from({ length: 6 }, (_, c) => (row && row[c] !== undefined ? row[c] : null))));
    styles.forEach((row, ri) => row && row.forEach((s, ci) => { if (!s) return; const a = X.utils.encode_cell({ r: ri, c: ci }); if (!ws[a]) ws[a] = { t: 's', v: '' }; ws[a].s = s; }));
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 22 }];
    ws['!rows'] = [{ hpt: 34 }, { hpt: 20 }];
    ws.__styled = true;
    const name = wb.SheetNames.includes('Summary') ? 'Dashboard' : 'Summary';
    wb.SheetNames.unshift(name); wb.Sheets[name] = ws;
  }

  function houseStyle(wb) {
    if (!wb || !wb.SheetNames || wb.__housed) return wb;
    wb.__housed = true;
    const info = wb.SheetNames.map(n => ({ name: n, ...styleSheet(wb.Sheets[n], n) }));
    const dataRows = info.reduce((t, s) => t + s.rows, 0);
    const looksLikeTemplate = info.every(s => s.rows <= 3) || wb.SheetNames.every(n => /templat|read ?me|instruction|example/i.test(n) || (info.find(i => i.name === n) || {}).rows <= 3);
    const hasSummary = /summary|dashboard|overview|cover/i.test(wb.SheetNames[0] || '');
    if (!looksLikeTemplate && dataRows > 0 && !hasSummary) { try { addSummary(wb, info); } catch (e) { console.warn('summary sheet', e); } }
    wb.Props = Object.assign({ Title: (document.title || 'Report'), Author: 'Bhayani & Co.', Company: 'Bhayani & Co., Chartered Accountants' }, wb.Props || {});
    return wb;
  }
  const W = X.write, WF = X.writeFile;
  X.write = function (wb, opts) { const o = opts || {}; if (!o.bookType || /^xls[xmb]?$/.test(o.bookType)) houseStyle(wb); return W.call(this, wb, { ...o, cellStyles: true }); };
  X.writeFile = function (wb, name, opts) { const o = opts || {}; if (!/\.csv$/i.test(name || '') && (!o.bookType || /^xls[xmb]?$/.test(o.bookType))) houseStyle(wb); return WF.call(this, wb, name, { ...o, cellStyles: true }); };
  X.__houseStyleApply = houseStyle;
})();
