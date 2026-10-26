/* Bhayani & Co portal — shared settings. The key below is Supabase's public "anon" key: it is meant to be in web pages; the database rules decide what each signed-in person can read or change. */
window.PORTAL = {
  supabaseUrl: 'https://ryspgvcfikxstwrlolxo.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5c3BndmNmaWt4c3R3cmxvbHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMzgzODEsImV4cCI6MjEwODYxNDM4MX0.7uyzaDN8Rw-6kdc9xb7XB_U8zdae2AQcenwUJZsbUNg',
  defaultPassword: 'admin@123',
  // login IDs that are not email addresses
  aliases: { 'admin@123': 'superadmin@bhayani-co.in' },
  tools: [
    { slug: 'gst', name: 'GST Desk', blurb: 'GST returns, ITC and sales reconciliation', group: 'Finance Model', sections: {
      dash: 'Dashboard', anal: 'Analysis', itc: 'ITC reco · 2B / IMS', sales: 'Sales reco · GSTR-1', xchk: 'Cross-checks · IRN / EWB', r2r: 'Return vs return',
      g1: 'GSTR-1 / IFF', g3b: 'GSTR-3B', g9: 'GSTR-9 / 9C', filing: 'Portal & filing', trk: 'ITC tracker', hold: 'Payment hold', mail: 'Vendor mails', inbox: 'AI mail inbox',
      cal: 'Due-date calendar', rules: 'ITC rules & reversals', gst: 'GSTIN status check', boe: 'Imports · BoE', calc: 'Interest & late fee', ntc: 'Notices & refunds',
      imp: 'Import & export', portal: 'Portal data vs books', ven: 'Vendor master', cus: 'Customer master', hsn: 'HSN / SAC master', client: 'Client & GSTINs', law: 'Law updates' } },
    { slug: 'tds', name: 'TDS & TCS Compliance Desk', blurb: 'Deduction, deposit, returns, 26AS reconciliation', group: 'Finance Model', sections: {
      desk: 'Desk', group: 'Group', tx: 'Transactions', parties: 'Parties', rates: 'Rate master', challans: 'Challans', returns: 'Returns', certs: 'Certificates',
      corr: 'Corrections', reco: 'Reconciliation', audit: 'Audit', adv: 'Advance tax', cal: 'Calendar', filing: 'Portal & filing' } },
    { slug: 'depreciation', name: 'Depreciation Workbench', blurb: 'Companies Act, income-tax blocks, deferred tax', group: 'Finance Model', sections: {
      register: 'Asset register', schedule: 'Companies Act schedule', it: 'Income-tax blocks', dt: 'Deferred tax', mat: 'MAT / AMT', analysis: 'Analysis', rates: 'Lives and rates' } },
    { slug: 'costing', name: 'Costing Workbench', blurb: 'Standard, process, job, ABC, landed cost, CAS', group: 'Finance Model', sections: {
      desk: 'Overview', std: 'Standard costing', proc: 'Process', jobs: 'Jobs & batches', svc: 'Services & projects', abc: 'Activity-based', land: 'Landed cost',
      cvp: 'Break-even', prof: 'Profitability', dec: 'Make or buy & pricing', cas: 'Cost sheet (CAS)' } },
    { slug: 'financial-analysis', name: 'Financial Analysis Desk', blurb: 'Ratios, DuPont, peers, CMA, valuation', group: 'Finance Model', sections: {
      overview: 'Overview', fin: 'Financials', ratios: 'Ratios', dupont: 'DuPont', peers: 'Peers', credit: 'Credit & CMA', value: 'Valuation' } },
    { slug: 'cfo', name: 'CFO Portal Desk', blurb: 'Budget, forecast, variance, cash, board pack', group: 'Finance Model', sections: {
      desk: 'Command centre', board: 'Boardroom', mail: 'Mail desk', work: 'Work board', budget: 'Budget', fcst: 'Rolling forecast', scen: 'Scenarios', ind: 'Industry engine',
      var: 'Variance (PVM)', trend: 'Trends', kpi: 'KPIs & covenants', cash: 'Cash forecast', dec: 'Decisions & capex', close: 'Month-end close', pack: 'Board pack' } },
    { slug: 'internal-audit', name: 'Internal Audit Desk', blurb: 'Risk-based internal audit, work papers, reports', group: 'Finance Model', sections: {
      home: 'Overview', engagements: 'Engagements', clients: 'Clients', matrix: 'Industry risk matrix', pbc: 'Data request', data: 'Data room', fin: 'Financials & ratios',
      auto: 'Automated audit', sample: 'Sampling', plan: 'Risk & planning', work: 'Work programme', observations: 'Observations', actions: 'Action tracker', report: 'Audit report', settings: 'Firm & settings' } },
    { slug: 'remittance', name: 'Foreign Remittance Desk', blurb: 'Form 145 / 146 (15CA / 15CB), DTAA, Form 144', group: 'Finance Model', sections: {
      desk: 'Desk', rem: 'Remittances', wiz: 'Part A/B/C/D wizard', payees: 'Payees & TRC', dtaa: 'DTAA rates', docs: 'Documents', ret: 'Form 144 link', ca: 'Form 146 register', look: 'Look & feel' } },
    { slug: 'society', name: 'Society Desk', blurb: 'Co-operative housing society ERP and accounts', group: 'Co-operative Society', sections: {
      home: 'Overview', houses: 'Houses & residents', dues: 'Maintenance dues', ledger: 'Expenses & invoices', events: 'Festivals & events', amenities: 'Clubhouse & amenities',
      sports: 'Cricket & sports', mygate: 'My gate & guests', polls: 'Polls & elections', gallery: 'Photos & videos', complaints: 'Complaints', meetings: 'Meetings & AGM',
      notices: 'Notices', gate: 'Gate, visitors & vehicles', reports: 'Annual finance', data: 'Import & export', team: 'Committee & roles', setup: 'Society setup' } },
  ],
  levels: { view: 'View only', use: 'Use (enter & edit data)', admin: 'Full control' },
};
