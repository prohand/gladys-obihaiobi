# Gladys Assistant — Obihai OBi

External integration for [Gladys Assistant](https://gladysassistant.com) that follows
**Obihai OBi** VoIP adapters (OBi200, OBi202, OBi110, OBi300, OBi302…) on the **local
network**: SIP lines, phone ports, incoming calls, uptime, and reboot.

Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
with the [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md)

## Features

| Surface              | What                                                                            |
| -------------------- | ------------------------------------------------------------------------------- |
| Device (one per box) | Status of SP1…SP4 and OBiTALK, state of PHONE1/PHONE2/LINE, uptime, firmware    |
| Transport badge      | `local` when the box answers, `unreachable` otherwise (`transports: ["local"]`) |
| Scene triggers       | `incoming_call`, `call_ended`, `registration_changed`, `box_connection_changed` |
| Scene actions        | `reboot_box`, `get_box_status`                                                  |
| Dashboard widget     | `obi_status`: lines, ports, uptime, Reboot button                               |
| Configuration        | Test the connection, Reboot a box                                               |
| Languages            | English, French, German, Spanish                                                |
| Catalog              | categories `network`, `notifications`; keywords; `countries`                    |

Requires **Gladys 5.3.0** or newer (manifest `keywords` and `countries`).

## How it works

The integration polls the status pages of the box web interface every few seconds
(`DI_S_.xml`, `PI_FXS_1_Stats.xml`), with HTTP Digest authentication, and publishes what
changed. A ringing phone, a hung-up call, a SIP line that drops or a box that goes offline
fire the scene triggers. No cloud, no OBiTALK account.

```
index.js                     start + graceful shutdown
src/integration.js           SDK handlers
src/obihai/                  HTTP client, Digest auth, XML readers, polling service
src/devices/obiBox.js        Gladys device of a box
src/capabilities/            scenes and widget
docs/                        user documentation (en, fr, de, es)
test/                        node --test, fake Gladys + fake OBi box
```

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
```

Run against a real Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="obihai-obi" \
LOG_LEVEL=debug \
npm start
```

## Workflows

Same workflows as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`): Prettier, ESLint, tests on Node 22 and 24; on pull requests, the store
  admission checks and a Docker build.
- **Release** (`release.yml`, Actions → Release → Run workflow): bumps the version
  (`package.json` + manifest + `docker_image`), rolls `CHANGELOG.md`, tags `vX.Y.Z`, builds
  the `linux/amd64` + `linux/arm64` image to `ghcr.io`, publishes the GitHub Release, then
  runs the full store checks.
- **Build** (`build.yml`): multi-arch image on a tag, a manual run or a call from Release.
- **GitHub Release** (`github-release.yml`): a Release for every version tag.
- **Dependabot**: npm weekly, GitHub Actions and Docker base image monthly.

## Publish

1. Add the GitHub topic `gladys-assistant-integration` to the repository.
2. Turn on **Private vulnerability reporting** (see [SECURITY.md](SECURITY.md)).
3. Describe the changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
4. **Actions → Release → Run workflow** (`minor` publishes 0.2.0, `major` publishes 1.0.0).

## License

Apache-2.0
