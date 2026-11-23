# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **Obihai OBi** VoIP adapters (OBi200,
OBi202, OBi110, OBi300, OBi302…): a Node.js service (Node 22+, ESM, no build step) that
runs in its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js); the
workflows come from [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel).

It reads the status pages of the box web interface **on the local network** (no cloud,
manifest `transports: ["local"]`), with HTTP Digest authentication.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/service.test.js          # one file
node --test --test-name-pattern "ringing" # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store --skip-image-check .   # store checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on Node 22 and
24; on pull requests it also runs the store admission checks and builds the Docker image.
Run the three commands before pushing.

## Architecture

```
index.js                          starts the SDK, graceful shutdown
src/integration.js                every SDK handler, registered before connect()
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                       LANGUAGES (en, fr, de, es), pick / localize
src/obihai/digest.js              HTTP Digest / Basic Authorization header
src/obihai/parser.js              readers of DI_S_.xml / PI_FXS_1_Stats.xml -> box model
src/obihai/client.js              HTTP client of ONE box (status, reboot)
src/obihai/service.js             polling loop, states, discovery, transports, scene events
src/devices/obiBox.js             Gladys device + states of a box
src/capabilities/scenes.js        scene triggers (data keys) + scene action handlers
src/capabilities/widget.js        dashboard widget "obi_status"
gladys-assistant-integration.json manifest
docs/{en,fr,de,es}.md             user documentation (en + fr re-hosted by Gladys, mandatory)
test/                             node --test, SDK fake Gladys + test/helpers/fakeObi.js
.github/scripts/changelog-release.mjs  changelog roll of the Release workflow
```

## Box pages

- `DI_S_.xml`: `Product Information` (ModelName, SoftwareVersion, SerialNumber,
  MACAddress, UpTime), `SPn Service Status` and `OBiTALK Service Status` (Status,
  CallState).
- `PI_FXS_1_Stats.xml`: `PHONEn Port Status` / `LINE Port Status` (State, LastCallerInfo).
- `rebootgetconfig.htm`: reboot (admin account only).
- The `user` account reads the same pages under `/user/`.

Names move a little between models and firmwares: the parser looks values up with
fallbacks, never with a single hard-coded path. Add a fixture to `test/helpers/fakeObi.js`
for any new format seen in the field.

## Rules

- **External ids are forever.** The device is `gladys.externalIds('obi', serial)` (MAC
  when the serial is missing); features are `<sp1|obitalk>-status`, `<phone1|line>-state`,
  `uptime`, `firmware`. Never change them: Gladys keys devices, history, scenes and
  dashboards on them. Same for manifest keys users store: `config_schema`, `actions`,
  `widgets` (`obi_status`), `scene_triggers`, `scene_actions` and their field, variable and
  output keys.
- **Every feature carries `name`, `min`, `max`, `read_only` and `has_feedback`** (NOT NULL
  in Gladys). Text features: `0`/`0`. The fake Gladys refuses a missing one.
- **Scene events**: one per transition, flat `data`, every key declared in the trigger
  `fields` or `variables` (`test/manifest.test.js` checks `SCENE_TRIGGERS`).
- **States** go through `publishChangedStates` (30-min heartbeat); `publishAllStates` after
  `onDeviceCreated`. Never flood: the host API takes 300 states per minute.
- **Secrets.** The password is a `secret` field; never log it, nor full caller numbers in
  warnings. The container rootfs is read-only: write only under `/data` (nothing to write
  today).
- **Versions belong to the Release workflow** (Actions → Release). Never edit `version` in
  `package.json` or the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js`
  checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading: the Release workflow moves the section.
- **Manifest.** `gladys_version` stays `>=5.3.0` (`keywords`, `countries`; widgets and
  scenes need 5.1.0). Catalog `description` 10 to 100 characters per language.
  `transports` stays `["local"]` unless a cloud path is added.
- **Languages.** Every user-facing text is `{ en, fr, de, es }`: manifest texts, action
  answers, connection status, widget texts (built with `src/i18n.js`), and the four
  `docs/*.md`, kept in sync. The manifest test fails on a missing language.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
  Tests never touch the network: inject `fetch` / `createClient`.
