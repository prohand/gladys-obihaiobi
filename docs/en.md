# Obihai OBi

Follow your **Obihai OBi** VoIP adapters (OBi200, OBi202, OBi110, OBi300, OBi302…) in
Gladys: the state of the SIP lines, the phone ports, the incoming calls, and reboot the box
from a scene or the dashboard.

The integration talks **directly to the box on your local network**, through the status
pages of its web interface. No cloud, no OBiTALK account, nothing to install on the box.

## Before you start

1. Find the **IP address** of the box: plug a phone into it and dial `***1`, the box reads
   its address. You can also look at the list of devices of your Internet box.
2. Check that you can open `http://<address>/` in a browser and sign in to the web
   interface.
3. Pick the **account**:
   - `admin`: full access, needed to **reboot** the box from Gladys;
   - `user`: read only (state of the lines and ports, no reboot).

   On a new box, both passwords are the same as the account name (`admin` / `user`):
   change them in the web interface (_System Management → Device Admin_).

> Tip: give the box a fixed IP address (DHCP reservation in your Internet box), so the
> address you enter in Gladys never changes.

## Configuration

| Field                | What to enter                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Address of the box   | `192.168.1.50`, or `192.168.1.50:8080`. Several boxes: `192.168.1.50, 192.168.1.51` (same password) |
| Account              | `admin` (reboot allowed) or `user` (read only)                                                      |
| Password             | The password of that account                                                                        |
| Refresh interval (s) | 5 by default. Short enough to see a phone ring (a ring cycle lasts about 6 s)                       |

Click **Test the connection**: the answer lists each box, its lines and its ports, or says
why it failed (wrong address, wrong password…).

Then open **Discover** and add the box: it becomes a Gladys device.

## The device

One device per box, named after its model and address (`OBi202 (192.168.1.50)`). It is
identified by its **serial number**: changing the IP address of the box keeps the device,
its history and your scenes.

| Feature          | Content                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| `SP1 status`…    | State of each SIP account: `Registered`, `Backing Off`, `Service Not Configured`… |
| `OBiTALK status` | State of the OBiTALK service: `Normal`, `Offline`…                                |
| `PHONE1 state`…  | State of each phone port: `On Hook`, `Off Hook`, `Ringing`                        |
| `Uptime`         | Seconds since the last start of the box                                           |
| `Firmware`       | Firmware version                                                                  |

The box shows a **Local** badge when it answers, **Unreachable** otherwise.

## Scenes

### Triggers

| Trigger                 | When                                        | Variables                                             |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------- |
| Incoming call           | a phone starts ringing                      | `device_name`, `port`, `caller_number`, `caller_name` |
| Call ended              | a phone is hung up                          | `device_name`, `port`, `duration_seconds`             |
| SIP line status changed | a line registers, or loses its registration | `device_name`, `service`, `status`, `status_text`     |
| Box online or offline   | the box stops answering, or answers again   | `device_name`, `host`, `status`, `reason`             |

Each trigger can be limited to one box, one port, one line or one status. Example: _when
PHONE1 rings, send me a message "Call from {{triggerEvent.data.caller_number}}"_.

### Actions

| Action                 | Result (outputs)                                                             |
| ---------------------- | ---------------------------------------------------------------------------- |
| Reboot an OBi box      | `rebooted`, `message` (needs the `admin` account; calls in progress are cut) |
| Read an OBi box status | `reachable`, `registered`, `status`, `in_call`, `ringing`                    |

Example: _every night at 4 am, if no call is in progress (`in_call` false), reboot the box_.

## Dashboard widget

The **OBi box** widget shows the lines, the phone ports and the uptime of one box, with a
**Reboot** button (asks for confirmation). Choose the box in the widget settings.

## Troubleshooting

- **"unreachable"**: check the address, that the box is on, and that Gladys runs on the same
  network.
- **"wrong user name or password"**: sign in to the web interface with the same account to
  check the password.
- **"this address does not answer like an OBi box"**: the address points to another device.
- **No ringing detected**: lower the refresh interval to 5 s or less.
- **Reboot refused**: use the `admin` account.

## Privacy

The integration only talks to the boxes you entered, on your local network. The password is
stored in a secret field of Gladys and is never written to the logs.
