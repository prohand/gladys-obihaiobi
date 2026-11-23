# Obihai OBi

Überwache deine **Obihai-OBi**-VoIP-Adapter (OBi200, OBi202, OBi110, OBi300, OBi302…) in
Gladys: den Status der SIP-Leitungen und der Telefonports, die eingehenden Anrufe, und
starte die Box aus einer Szene oder dem Dashboard neu.

Die Integration spricht **direkt mit der Box in deinem lokalen Netzwerk**, über die
Statusseiten ihrer Weboberfläche. Keine Cloud, kein OBiTALK-Konto, nichts auf der Box zu
installieren.

## Vorbereitung

1. Finde die **IP-Adresse** der Box: Schließe ein Telefon an und wähle `***1`, die Box sagt
   ihre Adresse an. Du findest sie auch in der Geräteliste deines Routers.
2. Prüfe, dass du `http://<Adresse>/` im Browser öffnen und dich an der Weboberfläche
   anmelden kannst.
3. Wähle das **Konto**:
   - `admin`: voller Zugriff, nötig, um die Box aus Gladys **neu zu starten**;
   - `user`: nur lesen (Status der Leitungen und Ports, kein Neustart).

   Bei einer neuen Box entsprechen die Passwörter dem Kontonamen (`admin` / `user`): Ändere
   sie in der Weboberfläche (_System Management → Device Admin_).

> Tipp: Gib der Box eine feste IP-Adresse (DHCP-Reservierung im Router), damit sich die in
> Gladys eingegebene Adresse nie ändert.

## Konfiguration

| Feld                         | Eingabe                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| Adresse der OBi-Box          | `192.168.1.50` oder `192.168.1.50:8080`. Mehrere Boxen: `192.168.1.50, 192.168.1.51` (gleiches Passwort) |
| Konto                        | `admin` (Neustart erlaubt) oder `user` (nur lesen)                                                       |
| Passwort                     | Das Passwort dieses Kontos                                                                               |
| Aktualisierungsintervall (s) | Standardmäßig 5. Kurz genug, um ein klingelndes Telefon zu erkennen (ein Klingelzyklus dauert etwa 6 s)  |

Klicke auf **Verbindung testen**: Die Antwort listet jede Box, ihre Leitungen und Ports auf
oder nennt den Grund des Fehlers (falsche Adresse, falsches Passwort…).

Öffne dann **Erkennung** und füge die Box hinzu: Sie wird zu einem Gladys-Gerät.

## Das Gerät

Ein Gerät pro Box, benannt nach Modell und Adresse (`OBi202 (192.168.1.50)`). Es wird über
seine **Seriennummer** erkannt: Eine neue IP-Adresse der Box behält das Gerät, seinen
Verlauf und deine Szenen.

| Funktion         | Inhalt                                                                          |
| ---------------- | ------------------------------------------------------------------------------- |
| `SP1 status`…    | Status jedes SIP-Kontos: `Registered`, `Backing Off`, `Service Not Configured`… |
| `OBiTALK status` | Status des OBiTALK-Dienstes: `Normal`, `Offline`…                               |
| `PHONE1 state`…  | Status jedes Telefonports: `On Hook`, `Off Hook`, `Ringing`                     |
| `Uptime`         | Sekunden seit dem letzten Start der Box                                         |
| `Firmware`       | Firmware-Version                                                                |

Die Box zeigt ein Abzeichen **Lokal**, wenn sie antwortet, sonst **Nicht erreichbar**.

## Szenen

### Auslöser

| Auslöser                    | Wann                                                          | Variablen                                             |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| Eingehender Anruf           | ein Telefon beginnt zu klingeln                               | `device_name`, `port`, `caller_number`, `caller_name` |
| Anruf beendet               | ein Telefon wird aufgelegt                                    | `device_name`, `port`, `duration_seconds`             |
| SIP-Leitungsstatus geändert | eine Leitung registriert sich oder verliert die Registrierung | `device_name`, `service`, `status`, `status_text`     |
| Box online oder offline     | die Box antwortet nicht mehr oder wieder                      | `device_name`, `host`, `status`, `reason`             |

Jeder Auslöser lässt sich auf eine Box, einen Port, eine Leitung oder einen Status
beschränken. Beispiel: _Wenn PHONE1 klingelt, schicke mir „Anruf von
{{triggerEvent.data.caller_number}}“_.

### Aktionen

| Aktion                     | Ergebnis (Ausgaben)                                                                |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Eine OBi-Box neu starten   | `rebooted`, `message` (braucht das Konto `admin`; laufende Anrufe werden getrennt) |
| Status einer OBi-Box lesen | `reachable`, `registered`, `status`, `in_call`, `ringing`                          |

Beispiel: _Jede Nacht um 4 Uhr, wenn kein Anruf läuft (`in_call` falsch), die Box neu
starten_.

## Dashboard-Widget

Das Widget **OBi-Box** zeigt die Leitungen, die Telefonports und die Laufzeit einer Box,
mit einer Taste **Neu starten** (mit Bestätigung). Wähle die Box in den Einstellungen des
Widgets.

## Fehlerbehebung

- **„nicht erreichbar“**: Prüfe die Adresse, ob die Box eingeschaltet ist und ob Gladys im
  selben Netzwerk läuft.
- **„falscher Benutzername oder falsches Passwort“**: Melde dich mit demselben Konto an der
  Weboberfläche an, um das Passwort zu prüfen.
- **„diese Adresse antwortet nicht wie eine OBi-Box“**: Die Adresse zeigt auf ein anderes
  Gerät.
- **Klingeln wird nicht erkannt**: Senke das Aktualisierungsintervall auf 5 s oder weniger.
- **Neustart abgelehnt**: Verwende das Konto `admin`.

## Datenschutz

Die Integration spricht nur mit den eingegebenen Boxen in deinem lokalen Netzwerk. Das
Passwort liegt in einem geheimen Feld von Gladys und wird nie in die Logs geschrieben.
