# Bhayani & Co. Chartered Accountants — Website

Static website: `index.html` (V11) with images in `assets/brand`, `assets/services` and `assets/industries`. Hosted on Render as a Static Site.

Previous home page is kept on branch `backup/pre-v11`.

- Publish directory: `.`
- Build command: none
- Every push to `main` redeploys automatically.

## Portal

- `/login/` — staff sign-in and "my tools" home
- `/admin/` — admin portal: users, tool and section access, clients master, mail configuration, firm settings, activity log
- `/portal/` — shared code: `config.js` (Supabase project + tool list), `core.js` (sign-in), `connect.js` (added to every tool: sign-in guard, section permissions, central storage)

Login and data live in Supabase (project `bhayani-portal`). Every tool saves to the shared `docs` table; row-level security allows only signed-in people with access to that tool.

## Client integration

- **Clients master** (Admin) — set a client up once with PAN, TAN, GSTINs and the tools it uses; the client is created inside each ticked tool (`portal/integrate.js` uses each tool's own constructor and storage format).
- **Client dashboard** (`/clients/`) — each client's headline figures from every linked tool, Open buttons that go straight to the client, and **Upload once** (one file offered to every tool that reads it, imported through that tool's own importer).
- **Figures flow** — Depreciation → Financial Analysis and CFO Desk; Financial Analysis → CFO Desk (applied with one click in the receiving tool).

## Tools (each at `<site>/<folder>/`, sign-in required)

| Folder | Tool |
|---|---|
| `gst/` | GST Desk |
| `tds/` | TDS & TCS Compliance Desk |
| `depreciation/` | Depreciation Workbench |
| `costing/` | Costing Workbench |
| `financial-analysis/` | Financial Analysis Desk |
| `cfo/` | CFO Portal Desk |
| `internal-audit/` | Internal Audit Desk |
| `remittance/` | Foreign Remittance Desk |
| `society/` | Society Desk (Co-operative Society) |

Outlook mail and Claude AI features inside the tools work only when the tool is opened in Claude.
