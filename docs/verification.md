# Verification scope

The pre-rename 0.5.0 implementation passed 88 Node unit tests, 21 controlled-provider Chromium flows, syntax/import checks, and bank validation. Finale and pressure calculations were compared against 671 and 500 checked-in cases from AST-isolated pure helpers of the original Python bot. Filigree 0.6.0 passed 89 Node unit tests, 22 controlled-provider Chromium flows (including old campaign/annotation migration), and runtime syntax/import/manifest/eight-bank checks. The ZIP is checked against the source tree after packaging.

These checks exercise the deterministic rules, campaign transactions, retry/cache behavior, metadata migration, interface flows, and package structure. Browser tests simulate the model; they do not prove narrative quality with a paid provider or every SillyTavern host/version. A user installation should be tested in a disposable solo chat before relying on an important campaign.

Run `npm test`, `npm run check`, `npm run test:browser`, and `npm run package` from the source checkout. The package command creates a fresh ZIP and SHA-256 line. Old interrupted operations should be completed before an upgrade or explicitly discarded; the last committed story remains recoverable.
