# Scene-bank authoring

A bank is a JSON object with `schemaVersion: 1` and one or more of `story`, `authoring`, `scene_cues`, or `scene_cards`. The parser retains additional author fields, rejects unsafe object keys and missing fragment references, and limits size and nesting. It does not execute user-supplied code.

```json
{
  "schemaVersion": 1,
  "metadata": { "name": "The Rain Station" },
  "story": {
    "style": "A grounded mystery in one railway station",
    "turn_budget": { "min": 22, "max": 28 },
    "premise_seeds": ["A courier has disappeared before the last train"],
    "pressure_seeds": ["The station closes at dawn"],
    "anchor_seeds": ["A tired porter", "An unopened parcel"],
    "possible_endings": ["The courier is found", "The courier remains missing"]
  },
  "scene_cues": {
    "situations": ["A platform goes suddenly quiet"],
    "details": ["A timetable has been altered"],
    "developments": ["An existing witness changes their story"]
  }
}
```

`story.manual_compass` can supply a complete authored compass instead of asking the model to create one; otherwise seeds form a sampled palette for a generated premise, pressure, anchors, three broad movements, ending mode, and target turns. A `turn_budget` range must be integers from 1 through 200. The budget is not a scene-by-scene script: it determines when the next *genuine* Critical Action forces the ending.

`scene_cues` are lists of short optional ideas. `scene_cards.common`, `scene_cards.by_phase`, and `scene_cards.by_kind` can supply slots such as a focus, location, or actor, optionally pointing to `fragments.*` or `authoring.*` paths. The selector avoids recent duplicates where possible and fades a repeated card for several turns. `authoring` can hold locations, NPCs, objects, setting rules, and scene-card overrides. `prompt_text` provides optional narrator instructions by kind; `outcome_contracts` and `trivial_contracts` can phrase result permissions. These are all subordinate to computed mechanics, player agency, and the mandatory ending verdict.

Use the in-extension scene builder to browse and edit fields, validate JSON, preview the narrator prompt without a model request, or export a bank. Applying a bank to an active adventure preserves its established context and compass but resets cue repetition and older rewind checkpoints. Export the campaign before replacing material you may want back. Legacy `objective_tracker` fields are preserved in imported/exported bank JSON but do not impose goals or validation rules.
