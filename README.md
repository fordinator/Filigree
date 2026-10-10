# Filigree

**Filigree: A Narrative RPG.** A self-contained, solo tabletop-style adventure extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern). The model describes the world and responds to player choices; JavaScript owns the character rules, dice, turn budget, pressure, persistence, and ending verdict. The model is a narrator and limited adjudicator, not the source of truth for a hidden objective checklist.

Filigree was developed from a private Python Discord game master. This repository contains the JavaScript extension, scene banks, and deterministic verification fixtures, **not** the original Discord bot or its private campaign data.

## What playing it feels like

Start in a solo character chat, create or roll six stats, give the character a description, and let Filigree open a local situation. Write an action in the Filigree panel or tap a suggested observation. The extension decides whether that attempt needs a roll, presents the check when it does, and narrates the result after the dice are settled. You can investigate, talk, rest, wander into a tangent, or pursue a different lead. The story compass and scene bank offer material; neither demands that you pursue a particular route.

The game has a turn budget so it cannot promise an ending forever. Once the committed scene count reaches the budget, **the next genuine Critical Action ends the adventure immediately**. Its result may be victory, defeat, or fatal defeat. A forced ending need not answer every mystery, and a good roll on the final action does not automatically guarantee an overall victory. You can also end an adventure manually.

## Install

Requirements: a working SillyTavern installation, a configured model provider, a modern browser with Web Crypto on HTTPS or localhost, and a **solo** character chat. Players do not need Node.js or a separate Filigree server/API key.

1. Export an existing campaign before changing extension versions. If an earlier DMBot Adventure extension is installed, **disable or remove its discoverable folder**, then reload the page. Running both versions at once would register competing gameplay controls.
2. In SillyTavern's extension installer, install from this repository URL: `https://github.com/fordinator/Filigree`. Alternatively, place this repository in your account's `extensions/Filigree` directory or the global `public/scripts/extensions/third-party/Filigree` directory. The manifest must be directly inside that `Filigree` folder, not nested inside another folder of the same name.
3. Reload SillyTavern after installation. Open a solo character chat. In extension settings, enable **Filigree controls**. The Filigree panel appears near the composer.
4. Start a **New adventure**. Disable other narrator/gameplay hooks for that chat. Keep a campaign in its original character chat and use one browser tab for it.

The installer script for a manual developer deployment is `node scripts/install.mjs --target /path/to/extensions/Filigree`. It refuses to overwrite an existing destination. A source checkout can be packaged with `npm run package`; the ZIP contains a single `Filigree/` runtime folder. Installing a new version into an already-open browser tab does **not** replace JavaScript already loaded in that tab. Reload the page; a stale tab can continue executing old extension code even while files on disk are current.

### Upgrading from DMBot Adventure 0.5.0

Filigree reads the old `dmbotAdventure` campaign, draft, and settings metadata when the new keys are absent. It maps the old built-in preset names to their Filigree names. The next successful save writes to the `filigree` namespace and leaves the old campaign key as a rollback record; when both exist, Filigree reads the new key. **Cancel Adventure** clears both namespaces after verification. Message reconciliation recognizes both old and new turn annotations; new narration uses the Filigree annotation.

Export the campaign JSON before upgrading. Finish an interrupted old-version action first if its in-flight dice matter: an operation prepared by a different engine flow cannot be safely resumed by the new code. Filigree will ask you to discard that interrupted action, preserving the last committed story and any pending check. Keep the old export if you may roll back. Do not leave the old extension enabled beside Filigree.

## Character creation

The six stats are **STR, DEX, CON, INT, WIS, CHA**. Manual creation accepts an integer from −8 to +8 for each. Rolled creation uses four six-sided dice per stat, exactly two positive and two negative, summed for a result that may reach ±10. The wizard lets you flip dice signs while preserving two of each before accepting a stat. A character description can establish appearance and background, or be skipped.

By default Filigree narrates with its own bounded RPG prompt through SillyTavern's configured provider. The optional **Use [character card] as Dungeon Master** choice instead uses that SillyTavern character card's native quiet generation for narration. Filigree still makes the checks, rolls, and coherence request. That mode binds the adventure to the selected card/avatar; changing cards mid-adventure is rejected. A card is context for voice and setting, not authority to change computed results.

## Action resolution: what code decides

| Step | Rule |
| --- | --- |
| Flavor Value (**FV**) | An action under 10 words gets −2; over 20 words gets +2; 10–20 gets 0. The model separately judges creativity (+2) and uniqueness (+2). These terms add; the word count is deterministic. |
| Erratic check | Four d6 are drawn before CV classification. `EV = d1 + d2 − d3 − d4`. If `abs(EV) > 6`, an immediate erratic event replaces the ordinary check, resets pressure, and must remain causally anchored to the scene. It is not itself a finale gate. |
| Change Value (**CV**) | The model classifies the *stakes of the attempt*, independent of the character's stats, from −7 to +7. `abs(CV) <= 1` is a minor no-roll action; `2..4` is roll-bearing; `5..7` is a Critical Action. The sign affects difficulty, but both signs are genuine Critical Actions. |
| Stat and Difficulty Value (**DV**) | The model selects a stat and a base DV from −7 to +7 for an average adult at +0, not this particular character. A chosen stat can override stat selection. For a Critical Action, adjusted `DV = baseDV + floor(CV / 2)`; otherwise DV is unchanged. |
| Action roll | Eight d6 are drawn: `total = sum(first four) − sum(last four) + selected stat + FV`. `margin = total − adjusted DV`. The margin, not the narrative meaning of the stat, selects the result tier. |

Margin tiers are **Great success** (≥7), **Good success** (≥5), **OK success** (≥3), **Slight success** (≥1), **Slight failure** (≥−1), **Kinda bad failure** (≥−3), **Bad failure** (≥−5), and **Very bad failure** (below −5). A very bad failure gets a separate plausibility check for immediate death; death is not automatic. A small suggested observation uses its own two-die trivial result and never substitutes for a consequential free-text action.

An earned success must actually resolve the attempted action rather than move the character endlessly “closer.” That rule does **not** require a new crisis, revelation, permanent fact, or larger stakes on every turn. Consequences should be the smallest ones that honestly fit the attempt and established world.

### Scene pressure and pacing

For an ordinary roll, the pressure draw uses `threshold = min(100, previous chance + 12 + min(48, abs(margin) * 6))`. A random integer from 1 to 100 triggers when it is at or below that threshold. A Critical Action uses `previous chance + 12` without the margin term, resets the accumulator, and suppresses a separate pressure twist even if the pressure draw triggers. Minor no-roll actions add 4 without a pressure draw. Erratic events reset pressure. A triggered ordinary pressure event grants the narrator **permission**, not an order, to develop an existing actor, stake, promise, or unanswered question. Scene-bank plot hits and pacing cues are suggestions, never mandatory commands.

The story compass has broad opening, development, and convergence movements. The phase cues switch at roughly 30% and 70% of the turn budget, following the original Python pacing, but a phase cannot itself end the game or block a tangent. The player may change direction; quiet scenes and useful answers count as story too.

### Endings

The budget counts **committed narrated turns**. When that count is already at least the budget, the next roll-bearing action with `abs(CV) >= 5` concludes in that same turn. The engine combines the current Critical Action margin with the average of *prior* Critical Action margins at equal weight: `determining = (current + priorAverage) / 2`, using zero for an empty prior history. The success percentage is `clamp(round-half-to-even(50 + 5 * determining), 1, 99)`. At 50% or above the overall verdict is victory; below it is defeat. Defeat becomes fatal if the current margin is ≤−9, the percentage is ≤15, or the current margin is ≤−5 while the prior mean is ≤−3. A plausible immediate fatal failure can end an adventure earlier.

The **End adventure** control writes a manual ending. If Critical Action history exists, a strictly positive mean yields victory and zero or lower yields defeat; without such history the ending is resolved from established fiction without a fabricated numeric verdict. An ordinary success on the last action and a bad overall verdict can coexist. The narrator must honor both the action result and the computed overall ending, not soften a defeat or postpone the end for an unresolved thread.

## How the narrative layer works

A scene bank provides broad premise, pressure, anchors, optional cards, cues, outcome text, and a target turn-budget range. At character completion Filigree samples a palette and either uses an authored manual compass or requests a compact generated compass: premise, pressure, up to four anchors, three movements, a possible ending mode, and target turns. The compass is a reference point, not a fixed sequence of objectives.

Each completed narrated turn follows **narration → continuity/brief extraction and audit → atomic campaign commit → native chat publication**. The narrator sees the action, fixed dice/outcome, scene-bank options, recent transcript, and a small active brief. The second model request returns suggested *trivial* actions, a version-2 brief, and a bounded audit. The brief stores the current scene, up to six relevant cast notes, six recent events, six live threads, a loose direction, and the last beat. It may drop stale threads or follow a new tangent. Old objective metadata survives in imported saves but is inert.

The audit can object to an explicit mechanical contradiction, an unexplained conflict with recent established facts, or an invented player decision. A hard issue needs an exact quote from the candidate narration as evidence and may cause one targeted repair. A pacing concern is **advisory**; it can leave a short hint for the next turn but never vetoes the current turn. The system compares recent substantive turns before suggesting an anti-loop change. It does not treat rest, dialogue, deliberate repetition, a quiet beat, or a player-led detour as failure. This is a bounded consistency aid, not a guarantee that any model will always tell a coherent story.

Structured helper outputs are schema-checked. The operation record caches validated replies and exact random draws across interruption/retry. A rejected narration invalidates narration and its dependent audit; malformed audit output repairs only the audit. Transport failure keeps valid cached work. Only the accepted turn is committed. Native saves are read back through SillyTavern's chat endpoint before success is claimed, and publication has an outbox for recovery after a save. A changed chat, card, or campaign revision cancels an in-flight completion rather than writing into the wrong conversation. Edited/swiped/deleted narration pauses play and offers a checkpoint rewind; the old chat text is not deleted.

## Scene banks and authoring

Eight banks ship under `presets/`: `scenes` (the general default), `ultra`, `frontier`, `bridge-gpt`, `bridge-fantasy-modern`, `bridge-zim`, `hybrid`, and `frontier-pre-vtm`. Several are preserved alternate-wrapper material; they are **not** a promise of exact behavior parity with each Python variant. Banks use JSON schemaVersion 1 and can include `metadata`, `story`, `authoring`, `scene_cues`, `scene_cards`, `fragments`, `prompt_text`, and outcome/trivial contracts. The scene builder loads, edits, previews, validates, imports, and exports banks. Applying a bank to a running adventure preserves its active story and compass while clearing optional cue repetition and old rewind checkpoints. Legacy `objective_tracker` fields in older banks are retained as author data but never enforced.

The parser limits import size and depth, rejects prototype-pollution keys and invalid references, and retains unknown author fields. See [scene-bank authoring](docs/scene-banks.md) for field behavior and a minimal example. Bank content is prompt material, not a trusted command stream: computed dice, player agency, setting rules, and the forced ending outrank suggestions in it.

## Persistence, exports, and recovery

Filigree stores campaigns and drafts in **per-chat metadata** and default settings in SillyTavern extension settings. It annotates its ordinary chat messages for idempotent publication and transcript reconciliation. Campaign export is JSON; transcript export is Markdown. Import validates a campaign and keeps a backup of the prior state in chat metadata. It does not replay imported transcript lines as fresh chat messages. Up to 40 pre-turn checkpoints support rewind. Reset clears the active campaign, draft, and import backup after confirmation and verified save; chat messages remain. Keep exports before upgrades and destructive experiments.

A generation error leaves the last committed story intact and exposes **Retry action** or **Discard interrupted action**. Retry retains recorded dice and accepted upstream evaluations; discard abandons the unfinished action but does not undo the previous turn. If a save or chat read-back cannot be verified, Filigree reports failure instead of assuming the change persisted. Use one tab per campaign: simultaneous writers are not synchronized.

## Model integration, cost, and limits

Filigree uses the provider already configured in SillyTavern. The default route uses the native OpenAI-compatible chat adapter where available or SillyTavern raw generation for other providers; card-DM narration uses native quiet generation. A normal narrated turn has a narration request plus a continuity/brief request, and free-text actions additionally need small evaluator requests. Invalid structured outputs may retry up to three times; one hard narrative rejection may repeat a stage and its dependents once before requiring an explicit Retry. Model quality affects CV judgment, prose, and audit reliability. The JavaScript math is deterministic after those bounded decisions, but this is not an offline game and usage may incur provider costs.

The extension supports solo character chats only. Group chats, concurrent-tab editing, exact alternate Python-wrapper behavior, arbitrary older SillyTavern versions, and guaranteed compatibility with every provider are not claimed. The controlled test harness uses simulated model output. No paid-provider narrative quality result is claimed for this release.

## Development

The runtime is browser ES modules; there is no production npm dependency. Node.js 20+ is used for local verification and packaging; Playwright/axe are developer dependencies. The core in `src/core/` is independent of SillyTavern, `src/engine.js` owns transactions, `src/services/` handles provider replies and narrative repair, `src/adapters/sillytavern.js` owns native persistence/publication, and `src/ui/` renders controls. `scripts/assets.mjs` defines the exact runtime asset set copied by installer and packager.

```bash
npm ci
npx playwright install chromium
npm test
npm run check
npm run test:browser
npm run package
```

The package command prints a unique `dist/release-*/Filigree-0.6.0.zip` path and SHA-256. Tests compare finale/pressure math against checked-in fixtures derived from AST-isolated pure helpers in the original Python bot; that source is not distributed here. The optional fixture-generation scripts accept a path to a copy you are authorized to use. For architecture and verified boundaries, see [architecture](docs/architecture.md) and [verification](docs/verification.md).

## License and provenance

No redistribution license is granted yet; the repository is publicly readable but is **not** automatically open-source licensed. The maintainer may add a license after reviewing rights in the included authored scene-bank material. SillyTavern is a separate project under its own license. “Filigree” is the name of this extension, not an endorsement by SillyTavern.
