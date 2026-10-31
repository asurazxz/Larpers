# Team setup (Supabase, login only)

Supabase provides Google login only. Solution data stays in the committed `web/data/bundle.json`.

Prereqs: Node.js 18+ (for `npx`), Git. Docker Desktop only if you want a local database.

1. Accept the Supabase org invite (check your email), then log in to the CLI:
   ```sh
   npx supabase login
   ```
2. Link this repo to the shared cloud project:
   ```sh
   npx supabase link --project-ref cpfymmjjpdmidhtlzgbt
   ```
   (Project: Larpers, Singapore — https://supabase.com/dashboard/project/cpfymmjjpdmidhtlzgbt)
3. Copy `.env.example` to `.env` and fill in the keys (ask in the group chat — never commit `.env`).

## Database workflow

The schema lives in `supabase/migrations/` so everyone's database matches the repo.

```sh
git pull                                    # get teammates' migrations first
npx supabase migration new add_some_table   # creates supabase/migrations/<timestamp>_add_some_table.sql
# write SQL in that file
npx supabase db push                        # apply new migrations to the cloud project
git add supabase/migrations && git commit   # push so others get it
```

Rules:
- **Don't create or alter tables in the Dashboard UI.** If you did, run `npx supabase db pull` and commit the generated migration.
- **Never edit a migration that's already been pushed** — write a new one instead.
- Say in the chat before running `db push` so two people don't push conflicting migrations at once.
- Enable Row Level Security on every table that the frontend reads.
- `SUPABASE_SECRET_KEY` bypasses RLS: use it only in backend code/scripts.

## Auth

- Google sign-in (Google Cloud Console setup, Supabase config, Next.js/Vite code, admin role):
  [AUTH.md](AUTH.md)
- Writing RLS policies for new tables: [RLS.md](RLS.md)
