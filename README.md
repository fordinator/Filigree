# Filigree

**Filigree: A Narrative RPG.** A self-contained, solo tabletop-style adventure extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern). 

**This is not just an AI SLOP Extension,** despite being generated mostly with AI. The project began over two years ago as an attempt to bring a little liveliness to a mostly empty *Discord* server. It was originally a *Discord* bot I called "DM Bot" and it has gone through **DOZENS** of hours of revisions and testing since then. At the urging of my friends it was suggested that I offer it as a *SillyTavern* Extension since it might find a "built-in" audience. I mostly *wanted* this to exist, made it with the tools available, and want someone who doesn't want to go through all that to have it, too.

The Extension is mostly faithful to its original *Python* source, so unfortunately it doesn't really integrate with many of the features of the *SillyTavern* environment. This might make it a "bad fit" for most users, but I wanted to offer it as an option anyhow. You can always uninstall other extensions or move this one to a separate User Profile. 

## How Filigree Works

I guess I need to talk a little about my "weird" mechanics first. They're based loosely on an old freeform d6-based RPG called *FUDGE*. For each stat, 4d6 are rolled, 2 positive, 2 negative. They are summed and the final result is the number used for the stat or check. This can result in values from -8 to +8, but the nature of multiple d6's has most of the results hovering around +0. For a character stat, a strength value of -8 might be "paralyzed paraplegic" with +8 being "God Himself." Most of us mortals hover around +0 ourselves. Keep that in mind as you play.

Creating a character involves six stats with two methods: STR, DEX, CON, INT, WIS, and CHA. "Create Character" is straightforward: just enter the stats you want. Remember though, this is a **NARRATIVE** RPG... the story is the point, not the mechanics, and a character with zero weaknesses is just a bore. If you don't want Ultimate Control you can "Roll Character." This generates according to a 4d6 method and gives 2 positive and 2 negative dice. To keep from being *solely* deterministic you can "flip" these by clicking on them. So for example if you get -6, -5, +2, +1 or -8, you can "flip" the two smaller numbers and get a "better" stat: +6, +5, -2, -1 -- +8.

After you determine your stats, write a small description of yourself and the type of world and adventure you want to have, and off you go!

# Playing a Game

The gameplay is intuitive, but the system behind it isn't. Along the top you will see your six stats and their values. You can click one of these to "use" it, with the prompt you type in the box. So for example you might click INT and type "Examine the formula to derive the solution." Or you might click DEX and type "Fling the throwing star at the ninja." SEND your action and the LLM decides everything else: the difficulty (DV or "Difficulty Value") the importance of the role (CV or "Criticality Value") as well as a special rating for the quality of your command (FV or "Fancy Value.") Based on the roll and all these modifiers, plus your stat, you succeed or fail and the LLM's narration of the next turn is appropriate.

Below the six stats are three "trivial actions." These are usually informational only, but always succeed, and they don't significantly advance the "state" of the game, so use them as investigation while you get your bearings. Finally, if you want to take an action but aren't sure what stat to use, just type what you want to do in the box, and the LLM will choose your stat FOR you.

Behind the scenes are working a complex system of plot hooks, narrative elements, characters, and scene pressure approaching a "turn clock" that prompts the end of the adventure. Once the "turn clock" counts down, the NEXT Critical Action decides that the adventure ends, and all Critical Actions so far along with the full context of the story determine the ending. In addition, if you reach a good spot that "feels right" to you, you can try an ending with "End Adventure." Undoing a turn does as described, but "Cancel Adventure" just nukes everything (if your game sucks for whatever reason) so feel free to use it until you experience something "cool."

# The Scene Bank System

After **MANY MANY MANY** hours of testing, I determined for myself that LLM storylines suck. The characters are bland, the description is uninteresting, the plot either reflects whatever the user says or lingers in a "limbo" state where nothing really happens. To fix this, me and AI *itself* worked out a "scene bank" system. This is a "seed file" with `json` parsed values that are "injected" into the system prompt at set intervals to keep them lively. (You can view the default inside the 'scene banks' folder in this repo, submissions are welcome!)

The cool part about this is you can pass the `json` to a decent LLM model and say for example, "write me a scene bank in this format for the Airwolf show on classic television." Then you can IMPORT it into Filigree and play an adventure that's generally "structured" without you actually knowing what it is. The Scene Bank editor is in the upper right of the panel, you have to IMPORT from `json` then "save for future adventures." This portion is **INCOMPLETE**, so maintaining a list of available "banks" is currently NOT supported -- you have to import each one yourself and SAVE, unless I decide to actually improve this system further.

# So what's actually left of SillyTavern?

Under great duress, I added an option for the Character Card to be reflected in Filigree's storyline. The checkbox is misleading, but if you "Use <character> as Dungeon Master" the currently-loaded character card will appear in-game as your **PRIMARY SIDEKICK**, **NOT** the Dungeon Master. Any prompt this card uses as their "introductory message" WILL factor into the story, so for a completely "neutral" Filigree experience, do NOT use the character card and specify the default "Assistant" as your chat partner.

# Choosing an LLM Model

This is probably the most important factor in whether you have a good or bad experience. Far be it from me to tell people what model to use, so I'll just give you the requirements: You need a model with "decent" role-playing ability that can "improvise" **BEYOND** its prompting relatively well, but it *also* needs to be "tool calling" so it can generate stats and rolls properly. Each "turn" of the game involves multiple prompts and a validation system to ensure nothing invalid is parsed, if you hit one of these you can cancel and retry, if it happens over and over you need a more compatible model. I have had success with local Qwen and Gemma variants, some of the cheaper models on OpenRouter, as well as ChatGPT and Claude, but the latter two tend to be focused more on consistency than creativity, in my mind.

# BEGIN AI SLOP PORTION OF THE README

### Because what would an AI slop repo be without an AI slop readme?

## Install

Requirements: a working SillyTavern installation, a configured model provider, a modern browser with Web Crypto on HTTPS or localhost, and a **solo** character chat. Players do not need Node.js or a separate Filigree server/API key.

1. Export an existing campaign before changing extension versions. If an earlier DMBot Adventure extension is installed, **disable or remove its discoverable folder**, then reload the page. Running both versions at once would register competing gameplay controls.
2. In SillyTavern's extension installer, install from this repository URL: `https://github.com/fordinator/Filigree`. Alternatively, place this repository in your account's `extensions/Filigree` directory or the global `public/scripts/extensions/third-party/Filigree` directory. The manifest must be directly inside that `Filigree` folder, not nested inside another folder of the same name.
3. Reload SillyTavern after installation. Open a solo character chat. In extension settings, enable **Filigree controls**. The Filigree panel appears near the composer.
4. Start a **New adventure**. Disable other narrator/gameplay hooks for that chat. Keep a campaign in its original character chat and use one browser tab for it.

The installer script for a manual developer deployment is `node scripts/install.mjs --target /path/to/extensions/Filigree`. It refuses to overwrite an existing destination. A source checkout can be packaged with `npm run package`; the ZIP contains a single `Filigree/` runtime folder. Installing a new version into an already-open browser tab does **not** replace JavaScript already loaded in that tab. Reload the page; a stale tab can continue executing old extension code even while files on disk are current.
