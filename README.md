# Bhayani & Co. Chartered Accountants — Website

Static website (single `index.html`). Hosted on Render as a Static Site.

- Publish directory: `.`
- Build command: none
- Every push to `main` redeploys automatically.

## Portal

- `/login/` — staff sign-in and "my tools" home
- `/admin/` — admin portal: users, tool and section access, clients master, mail configuration, firm settings, activity log
- `/portal/` — shared code: `config.js` (Supabase project + tool list), `core.js` (sign-in), `connect.js` (added to every tool: sign-in guard, section permissions, central storage)

Login and data live in Supabase (project `bhayani-portal`). Every tool saves to the shared `docs` table; row-level security allows only signed-in people with access to that tool.

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
