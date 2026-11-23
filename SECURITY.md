# Security policy

## Supported versions

Only the latest release of the Obihai OBi integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 0.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-obihaiobi](https://github.com/prohand/gladys-obihaiobi/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration, of Gladys and the model and firmware of the OBi box;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove passwords, addresses and phone numbers first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the OBi
boxes and their firmware (report to Poly / HP, the maker of Obihai products), and the
SIP providers.

## Good practices for users

- Change the default passwords of the OBi web interface (`admin` / `user`).
- Use the `user` account (read only) when you do not need to reboot the box from Gladys.
- Never expose the web interface of the box to the Internet: the integration only needs
  the local network.
- Keep Gladys, the integration and the firmware of the box up to date.
