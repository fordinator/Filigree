# Changelog

## Unreleased

- Removed the seven alternate bundled scene banks. The general `scenes` bank is now the only bundled preset.
- Older preset selections fall back to `scenes`; existing campaigns keep their embedded bank data, and custom/imported banks remain supported.

## 0.6.0 — Filigree

- Renamed the extension, installation folder, manifest, package, interface, preset slugs, exports, and current documentation to Filigree.
- Added read-through migration for campaigns, drafts, settings, turn annotations, and older preset selections. New state and message annotations use Filigree names; reset clears both old and new metadata.
- Preserved the 0.5.0 active-narrative engine, advisory scene pressure, deterministic mechanics, and budget-critical ending rules.
- Published a clean source snapshot without prior private development logs or Git history.

Earlier 0.x development took place under the DMBot Adventure name. Export a campaign before upgrading, finish any in-flight action if its dice matter, disable the old extension, and reload SillyTavern.
