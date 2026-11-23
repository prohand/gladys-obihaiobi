# Obihai OBi

Suivez vos adaptateurs VoIP **Obihai OBi** (OBi200, OBi202, OBi110, OBi300, OBi302…) dans
Gladys : l'état des lignes SIP, des ports téléphone, les appels entrants, et redémarrez le
boîtier depuis une scène ou le tableau de bord.

L'intégration parle **directement au boîtier sur votre réseau local**, via les pages d'état
de son interface web. Pas de cloud, pas de compte OBiTALK, rien à installer sur le boîtier.

## Avant de commencer

1. Trouvez l'**adresse IP** du boîtier : branchez un téléphone dessus et composez `***1`, le
   boîtier énonce son adresse. Vous pouvez aussi regarder la liste des appareils de votre
   box Internet.
2. Vérifiez que vous pouvez ouvrir `http://<adresse>/` dans un navigateur et vous connecter
   à l'interface web.
3. Choisissez le **compte** :
   - `admin` : accès complet, nécessaire pour **redémarrer** le boîtier depuis Gladys ;
   - `user` : lecture seule (état des lignes et des ports, pas de redémarrage).

   Sur un boîtier neuf, les mots de passe sont identiques au nom du compte (`admin` /
   `user`) : changez-les dans l'interface web (_System Management → Device Admin_).

> Astuce : donnez une adresse IP fixe au boîtier (réservation DHCP dans votre box
> Internet), pour que l'adresse saisie dans Gladys ne change jamais.

## Configuration

| Champ              | Quoi saisir                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Adresse du boîtier | `192.168.1.50`, ou `192.168.1.50:8080`. Plusieurs boîtiers : `192.168.1.50, 192.168.1.51` (même mot de passe) |
| Compte             | `admin` (redémarrage possible) ou `user` (lecture seule)                                                      |
| Mot de passe       | Le mot de passe de ce compte                                                                                  |
| Intervalle (s)     | 5 par défaut. Assez court pour voir un téléphone sonner (une sonnerie dure environ 6 s)                       |

Cliquez sur **Tester la connexion** : la réponse liste chaque boîtier, ses lignes et ses
ports, ou explique l'échec (mauvaise adresse, mauvais mot de passe…).

Ouvrez ensuite **Découverte** et ajoutez le boîtier : il devient un appareil Gladys.

## L'appareil

Un appareil par boîtier, nommé d'après son modèle et son adresse (`OBi202 (192.168.1.50)`).
Il est identifié par son **numéro de série** : changer l'adresse IP du boîtier garde
l'appareil, son historique et vos scènes.

| Fonctionnalité   | Contenu                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| `SP1 status`…    | État de chaque compte SIP : `Registered`, `Backing Off`, `Service Not Configured`… |
| `OBiTALK status` | État du service OBiTALK : `Normal`, `Offline`…                                     |
| `PHONE1 state`…  | État de chaque port téléphone : `On Hook`, `Off Hook`, `Ringing`                   |
| `Uptime`         | Secondes depuis le dernier démarrage du boîtier                                    |
| `Firmware`       | Version du firmware                                                                |

Le boîtier affiche un badge **Local** quand il répond, **Injoignable** sinon.

## Scènes

### Déclencheurs

| Déclencheur              | Quand                                              | Variables                                             |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| Appel entrant            | un téléphone se met à sonner                       | `device_name`, `port`, `caller_number`, `caller_name` |
| Appel terminé            | un téléphone est raccroché                         | `device_name`, `port`, `duration_seconds`             |
| État de ligne SIP changé | une ligne s'enregistre, ou perd son enregistrement | `device_name`, `service`, `status`, `status_text`     |
| Boîtier en ligne ou non  | le boîtier ne répond plus, ou répond de nouveau    | `device_name`, `host`, `status`, `reason`             |

Chaque déclencheur peut être limité à un boîtier, un port, une ligne ou un état. Exemple :
_quand PHONE1 sonne, envoie-moi « Appel de {{triggerEvent.data.caller_number}} »_.

### Actions

| Action                       | Résultat (sorties)                                                              |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Redémarrer un boîtier OBi    | `rebooted`, `message` (compte `admin` requis ; les appels en cours sont coupés) |
| Lire l'état d'un boîtier OBi | `reachable`, `registered`, `status`, `in_call`, `ringing`                       |

Exemple : _chaque nuit à 4 h, si aucun appel n'est en cours (`in_call` faux), redémarre le
boîtier_.

## Widget du tableau de bord

Le widget **Boîtier OBi** affiche les lignes, les ports téléphone et la durée de
fonctionnement d'un boîtier, avec un bouton **Redémarrer** (demande une confirmation).
Choisissez le boîtier dans les réglages du widget.

## Dépannage

- **« injoignable »** : vérifiez l'adresse, que le boîtier est allumé, et que Gladys tourne
  sur le même réseau.
- **« nom d'utilisateur ou mot de passe incorrect »** : connectez-vous à l'interface web avec
  le même compte pour vérifier le mot de passe.
- **« cette adresse ne répond pas comme un boîtier OBi »** : l'adresse pointe vers un autre
  appareil.
- **Sonnerie non détectée** : baissez l'intervalle de rafraîchissement à 5 s ou moins.
- **Redémarrage refusé** : utilisez le compte `admin`.

## Confidentialité

L'intégration ne parle qu'aux boîtiers que vous avez saisis, sur votre réseau local. Le mot
de passe est stocké dans un champ secret de Gladys et n'est jamais écrit dans les logs.
