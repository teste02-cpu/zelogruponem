<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Reporting remains login-free: `analyzeIncidentPhoto`/`createIncident` are public server functions protected by a per-hashed-IP hourly limit (`src/lib/rate-limit*.ts`, `request_log` table, service-role only). Incidents are inserted only by `createIncident` (service role); anonymous rows use the all-zero `user_id`. Reporters may optionally create/sign into an account at `/conta`; validate their session before linking incidents to their `user_id`, and keep reporter accounts out of staff access. Anonymous reporters follow tickets via `tracking_token`s kept in localStorage (`src/lib/tracked-tickets.ts`) and `getTrackedIncidents`.
- AI only SUGGESTS priority (`ai_priority`, `ai_priority_reason`, via `finalizePriority` in `src/lib/priority.ts`; rule may raise to ALTA, is fallback when AI fails). The manager defines the final `priority` in the dashboard (`priority_confirmed`, `priority_set_by`). Keep `priority.test.ts` in sync.
- AI calls live in `src/lib/ai/*.server.ts` (Responses API, streamed structured output) and are loaded via dynamic import inside server-function handlers.
- Incident photos are uploaded by the server into the private `incident-photos` bucket under `anon/…` (older ones under `{userId}/…`); staff see them through signed URLs.
- Dashboard/staff access = `admin` role only (`is_staff()` checks admin; RLS and server functions rely on it). `maintenance` members are only assignable responsibles and otherwise behave like regular users (own tickets via `/conta`). Google and reporter signups start with only the `user` role. Administrators manage promotions in the admin-only Users area. The first non-Google, non-reporter account keeps the existing admin bootstrap behavior.
- The camera/field screens use the `.dark` token set as "field mode"; the admin dashboard uses the light paper theme.
- Keep the Lovable Cloud-managed `.env` tracked in git (not in `.gitignore`): the publish build reads the public `VITE_SUPABASE_*` values from it, and ignoring it breaks the live site with "Missing Supabase environment variable(s)". It holds only public values; secret keys never go there.
