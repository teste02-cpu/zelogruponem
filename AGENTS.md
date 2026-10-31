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
- Incidents are inserted only by the `createIncident` server function (service role); there is no INSERT policy for users, so AI-computed priority cannot be forged from the browser.
- Priority = AI verdict passed through `finalizePriority` in `src/lib/priority.ts`; the deterministic rule may raise to ALTA but never lowers it, and is the fallback when AI fails. Keep `priority.test.ts` in sync.
- AI calls live in `src/lib/ai/*.server.ts` (Responses API, streamed structured output) and are loaded via dynamic import inside server-function handlers.
- Incident photos are in the private `incident-photos` bucket under `{userId}/…`; UI shows them through signed URLs.
- Staff = `admin` or `maintenance` role (`is_staff()`); the first account to sign up becomes admin via the signup trigger.
- The camera/field screens use the `.dark` token set as "field mode"; the admin dashboard uses the light paper theme.
