# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

### Added

- First version of the Obihai OBi integration, built from the official Gladys
  integration template.
- One Gladys device per OBi box (OBi200, OBi202, OBi110, OBi300, OBi302…), keyed on
  its serial number: state of each voice service (SP1…SP4, OBiTALK), state of each
  phone port (PHONE1, PHONE2, LINE), uptime and firmware.
- Local connection only (manifest `transports: ["local"]`): the status pages of the
  box are read on the local network, with HTTP Digest authentication, `admin` or
  `user` account. Several boxes sharing one password.
- Scene triggers: incoming call (caller number and name), call ended (duration),
  SIP line status changed, box online or offline.
- Scene actions: reboot an OBi box, read an OBi box status.
- Dashboard widget "OBi box": lines, phone ports, uptime and a Reboot button.
- Configuration screen buttons: test the connection, reboot a box.
- Texts and documentation in English, French, German and Spanish.
- Catalog keywords and countries (Gladys 5.3.0 or newer).
