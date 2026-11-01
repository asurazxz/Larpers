# Vercel hosting and handover

## Ownership record

Status checked on **2 November 2026**: **transfer pending**.

| Item | Value |
|---|---|
| Published demo | https://larpers-three.vercel.app/ |
| Intended hosting maintainer | Denzel |
| Receiving Vercel team | **denz**, slug `denz6` |
| Receiving team ID | `team_b9bW5sgmNursUfkl47sAQDw4` |
| Destination inspection | Connected account can access this team; it currently lists no projects |
| Source project | Existing host must confirm the project serving the demo; source account is not accessible through the connected account |
| Git remote in this checkout | https://github.com/asurazxz/Larpers.git |

## Transfer the existing project

The current owner must initiate the handover. In the source project's **Settings → General → Transfer Project**, select the receiving team. The dashboard flow requires the initiator to own the source team and belong to the destination team. If Vercel provides a transfer/claim link, share it privately with Denzel for acceptance into `denz6`; keep it out of Git.

Review the transfer summary, destination plan and any payment requirements. Retain the current project name and demo domain where available. Vercel supports transfers without downtime and moves deployments, project settings, domains, the Git link and most environment variables. Integrations need separate attention; some storage resources and configuration need separate migration. Follow the current [Vercel transfer documentation](https://vercel.com/docs/projects/transferring-projects) and the project's transfer summary.

## Repository deployment reference

These values come from the repository, rather than an inspection of the source Vercel project. Preserve and compare the existing project's settings during handover.

| Setting | Repository reference |
|---|---|
| Application directory | `web` |
| Framework | Next.js |
| Node requirement | `web/package.json` requires Node.js 22 or later |
| Build script | `npm run build` |
| Export | `web/next.config.mjs` uses `output: 'export'`; output is `web/out` |
| Browser configuration names | `NEXT_PUBLIC_SOLVER_API_URL` in `web/.env.example` |

Keep the current environment values and deployment behavior. Public demo instructions describe stored runs without a hosted solver API. The local FastAPI solver is a separate service; see [api/README.md](../api/README.md). The app has no login, so no external auth service moves with it.

## Verify before closing the handover

- [ ] Confirm the project appears under `denz6` and record its project ID here.
- [ ] Confirm `larpers-three.vercel.app` is attached and opens in a private browser window.
- [ ] Check the map, stored results, scenario selection and audit view against the existing demo.
- [ ] Remove any leftover `NEXT_PUBLIC_SUPABASE_*` or `NEXT_PUBLIC_REQUIRE_LOGIN` variables from the Vercel project; the app no longer reads them.
- [ ] Check the linked repository, production branch, Git provider access and build settings so Denzel can maintain future deployments.
- [ ] Check environment variable names and scopes in Vercel without copying secret values into documentation.
- [ ] Review any integrations, external service owners and usage/billing responsibilities with the outgoing host.
- [ ] Record completion date, actual project ID and final URL here; update the README's pending status. Change demo links in the README and [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) only if the URL actually changes.

## Ongoing maintenance

Denzel is the intended contact for Vercel hosting after acceptance. Monitor deployment failures, service usage and any billing notices in the receiving team. Keep the offline fallback available using the README instructions. Preserve the hackathon runbook and proposals as historical records; this document tracks the hosting handover.
