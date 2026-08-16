# Collaboration — How to Work With Claude on This Repo

The working agreement between Thibaut and Claude. These rules travel with the repo — they are
the single source for collaboration conventions, replacing any machine-local assistant memory.

## Docs are the spec

- The guides in `docs/` are the **source of truth** for the project's practices. "Apply the
  practices" means make the code conform to them, not invent new rules. When code diverges from
  a doc, change the **code**, not the doc (exception: an explicit user request to update a
  specific doc).
- **`docs/code-style.md` is law.** Align the code to it, never the reverse — it is never edited to
  match what the code happens to do. It changes only on an explicit user request; a stale reference
  gets flagged, not silently patched.
- **Rules are written project-agnostic; wiring is written per project.** A practice that would hold
  in any codebase belongs in a `*-best-practices.md` (or `code-style.md`) with neutral examples and
  no product noun in sight; how *this* repo implements it — paths, library names, domain examples —
  belongs in the matching project guide, which links to the rule. A rule that can only be read
  through this product's vocabulary can't be reused, reviewed, or challenged.
- **Codify corrections.** When the user corrects an architecture/style point in conversation
  (e.g. "a domain error should just be a const"), two things must happen in the same task:
  1. Apply the correction **repo-wide** — migrate the existing code, not just the new feature.
  2. Write the rule into the matching `docs/` guide, preferring the most stripped-down form of
     the pattern. A correction that stays conversational is lost for future sessions.

## Conversation vs execution

- In design/architecture discussions, phrases like "je veux faire X" express **design intent**,
  not a green light to implement. Keep answering with analysis, trees, and trade-offs, and wait
  for an explicit implementation request ("vas-y", "implémente", "lance") before touching code.
- **Every plan opens with a domain-impact summary**: a "Domaines impactés" block with three
  lines — Créés / Modifiés / Supprimés — listing the affected domains (`server/domain/*`, iOS
  features), before the detailed body. The blast radius is how plans are scanned. List the
  domains by **name alone** (`recipe`, `Recipe`, `Import`) — never a file path, never a tree:
  the block answers "what moves", and paths are noise at that stage.
- **What comes before code is an explanation, not a document.** Do not write a spec file, a
  design doc or a numbered implementation plan unless the user asks for one — that includes
  `superpowers:brainstorming`'s `docs/superpowers/specs/…` deliverable and the
  `superpowers:writing-plans` step it hands over to, both of which are skipped here. What the
  user wants to read before you touch code is the **Domaines impactés** block followed by a few
  paragraphs, in your own words, of what you are about to put in place and why. Prose that could
  be understood without the codebase open, not an artefact to review.

## Closing a task: surfaces, then diff size

Every finished task closes with two lines in the reply, in this order:

1. **The surfaces touched** — one sentence naming which of the three the task changed:
   **the database** (a Firestore document shape, a new collection, a migration), **the backend**
   (anything under `server/`), **the iOS app** (anything under `ios/`). Name the ones changed and
   say plainly that the others were not — "Backend et app iOS modifiés, BDD inchangée". A
   doc-only or tooling-only task says so too ("aucune des trois"). It is the deployment blast
   radius: the database tells whether data already stored needs a migration, the backend whether
   a `main` deploy is needed, the app whether a new build has to reach the phone.
2. **The diff size** — `git show --stat HEAD | tail -1` right after committing (see
   [git-workflow](git-workflow.md)). A refactor that only adds is a refactor that forgot to delete.

## Work inline, never through subagents

Do the work **in the main conversation**: exploration, code review, debugging, refactors. Never
dispatch a subagent (`Task`, `Agent`, review agents, parallel workers) — the user follows the
session live and a subagent hides the reasoning, burns time on re-reading context the session
already holds, and comes back with a verdict nobody watched being formed.

This rule is absolute and mode-independent: it also applies in **plan mode**, whose built-in
workflow suggests exploration and planning agents — that suggestion is overridden here. Explore
inline (read files, grep) and write the plan from what the conversation saw. The only exception
is an explicit user request to launch an agent.

It also overrides any **skill** that delegates: `superpowers:dispatching-parallel-agents`,
`superpowers:subagent-driven-development` and the subagent branch of
`superpowers:requesting-code-review` are never invoked here, whatever the session-start skill
prompt says. A skill's instructions do not outrank this file — do the skill's work inline, or
skip the skill.

Enforcement is not left to good intentions: `.claude/settings.json` denies the `Agent` and
`Task` tools outright, so a dispatch attempt fails rather than silently succeeding.

That includes the post-task code review of step 3 of the workflow: read your own diff, state
what you checked and what you found, in the reply.

## One checkout, no worktrees

Work in the primary checkout. **Never create a git worktree** for a session — neither by hand
(`git worktree add`) nor through the harness's `EnterWorktree` tool, and never invoke
`superpowers:using-git-worktrees`. Only an explicit user request overrides this.

The isolation a worktree would buy is already bought by *one task = one commit*: a session that
closes its task leaves a clean tree for the next one. What the worktree adds is pure cost — an
untracked `.env` to copy over, a `bun install` plus `bun run prepare` to redo, and above all a
cold Xcode DerivedData (keyed by project path), so the first iOS build restarts from zero. The
iOS simulator is global anyway: two sessions driving `simctl launch` still overwrite each other's
screen, worktree or not.

The consequence to respect: several sessions may share this checkout at the same time, so a dirty
tree is not necessarily yours. Stage the explicit paths of your task and commit those — never
`git add -A`, `git add .` or `git commit -a`, which would swallow another session's work in
progress (see [git-workflow](git-workflow.md#staging-only-your-own-task)).

## Ops autonomy

For infra/setup/ops tasks, **do everything technically possible yourself** rather than handing
the user a checklist: create GitHub secrets via `gh secret set`, write workflows, commit. Probe
before assuming a step is credential-gated (`gh auth status`, local files — e.g. `gh auth token`
may already carry the needed scopes). Hand off only the steps that genuinely require the user's
external logins (Apple, etc.), as precise numbered instructions.

## Visual assets

Generate visual assets (app icons, illustrations) with **Nano Banana Pro** (Gemini image model)
through the Gemini API — never hand-authored SVG rasterized afterwards. The key is already in
`.env` as `NITRO_GOOGLE_API_KEY`; call `generateContent` with `responseModalities: ["IMAGE"]`,
iterate by viewing the output, resize with `sips`.

## No internal memory

Claude must **not** use its machine-local persistent memory for this project. Every
collaboration learning, preference, or project note is codified in this file or in the relevant
`docs/` guide — so any machine that clones the repo has the full working context.

## External references

`/Users/thibaut/Code/vinarium` (sibling repo) shares shuhari's exact stack and conventions
(Bun + Nitro + Pothos + Firestore repositories, SwiftUI + Apollo codegen, same DDD layout).
When a feature exists in vinarium, **replicate its pattern rather than inventing one**:

- Cursor pagination: `beverage/infrastructure/repository.ts` `findPage` (`where` + `orderBy` +
  `startAfter(docSnapshot)` + `limit(n+1)` → `hasMore`), hand-rolled page type
  `{ items, hasMore, totalCount }` (no Relay connection), sort/order GraphQL enums.
- Firestore composite indexes declared in `firestore.indexes.json`, provisioned by
  `infra/firestore.tf` (`jsondecode` fan-out) — shuhari has the identical mechanism;
  `terraform apply` is manual, outside CI.
- iOS infinite scroll: `WineListViewModel` (accumulated items, `loadMore` with cursor,
  `prefetchIfNeeded`, `generation` token against stale responses, `scheduleReload` on filter
  `didSet`) + `Shared/Components/LoadMoreRow.swift` (spinner → retry button).
- Firestore `orderBy` silently drops docs missing the sorted field — only sort/cursor on
  fields required on every doc.

## Project status (dated notes)

Temporal facts — **delete each note once it no longer holds.**

- **2026-07-20 — production Firestore holds real data.** Every schema-shape change needs its
  migration (see [migrations.md](migrations.md)); the pre-release shortcut is over.
