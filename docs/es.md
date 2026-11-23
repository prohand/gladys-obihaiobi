# Obihai OBi

Siga sus adaptadores VoIP **Obihai OBi** (OBi200, OBi202, OBi110, OBi300, OBi302…) en
Gladys: el estado de las líneas SIP, de los puertos de teléfono, las llamadas entrantes, y
reinicie el equipo desde una escena o el panel.

La integración habla **directamente con el equipo en su red local**, a través de las páginas
de estado de su interfaz web. Sin nube, sin cuenta OBiTALK, nada que instalar en el equipo.

## Antes de empezar

1. Busque la **dirección IP** del equipo: conecte un teléfono y marque `***1`, el equipo
   dice su dirección. También puede verla en la lista de dispositivos de su router.
2. Compruebe que puede abrir `http://<dirección>/` en un navegador e iniciar sesión en la
   interfaz web.
3. Elija la **cuenta**:
   - `admin`: acceso completo, necesario para **reiniciar** el equipo desde Gladys;
   - `user`: solo lectura (estado de las líneas y puertos, sin reinicio).

   En un equipo nuevo, las contraseñas son iguales al nombre de la cuenta (`admin` /
   `user`): cámbielas en la interfaz web (_System Management → Device Admin_).

> Consejo: asigne una IP fija al equipo (reserva DHCP en su router), para que la dirección
> introducida en Gladys no cambie nunca.

## Configuración

| Campo                    | Qué introducir                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Dirección del equipo OBi | `192.168.1.50` o `192.168.1.50:8080`. Varios equipos: `192.168.1.50, 192.168.1.51` (misma contraseña) |
| Cuenta                   | `admin` (reinicio permitido) o `user` (solo lectura)                                                  |
| Contraseña               | La contraseña de esa cuenta                                                                           |
| Intervalo (s)            | 5 por defecto. Lo bastante corto para ver sonar un teléfono (un ciclo de timbre dura unos 6 s)        |

Pulse **Probar la conexión**: la respuesta enumera cada equipo, sus líneas y sus puertos, o
explica el fallo (dirección incorrecta, contraseña incorrecta…).

Después abra **Descubrimiento** y añada el equipo: se convierte en un dispositivo de Gladys.

## El dispositivo

Un dispositivo por equipo, con el nombre de su modelo y su dirección
(`OBi202 (192.168.1.50)`). Se identifica por su **número de serie**: cambiar la dirección IP
del equipo conserva el dispositivo, su historial y sus escenas.

| Función          | Contenido                                                                         |
| ---------------- | --------------------------------------------------------------------------------- |
| `SP1 status`…    | Estado de cada cuenta SIP: `Registered`, `Backing Off`, `Service Not Configured`… |
| `OBiTALK status` | Estado del servicio OBiTALK: `Normal`, `Offline`…                                 |
| `PHONE1 state`…  | Estado de cada puerto de teléfono: `On Hook`, `Off Hook`, `Ringing`               |
| `Uptime`         | Segundos desde el último arranque del equipo                                      |
| `Firmware`       | Versión del firmware                                                              |

El equipo muestra una insignia **Local** cuando responde, **Inaccesible** si no.

## Escenas

### Disparadores

| Disparador                   | Cuándo                                            | Variables                                             |
| ---------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| Llamada entrante             | un teléfono empieza a sonar                       | `device_name`, `port`, `caller_number`, `caller_name` |
| Llamada terminada            | se cuelga un teléfono                             | `device_name`, `port`, `duration_seconds`             |
| Estado de línea SIP cambiado | una línea se registra o pierde su registro        | `device_name`, `service`, `status`, `status_text`     |
| Equipo en línea o no         | el equipo deja de responder, o vuelve a responder | `device_name`, `host`, `status`, `reason`             |

Cada disparador puede limitarse a un equipo, un puerto, una línea o un estado. Ejemplo:
_cuando suene PHONE1, envíame «Llamada de {{triggerEvent.data.caller_number}}»_.

### Acciones

| Acción                          | Resultado (salidas)                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Reiniciar un equipo OBi         | `rebooted`, `message` (necesita la cuenta `admin`; las llamadas en curso se cortan) |
| Leer el estado de un equipo OBi | `reachable`, `registered`, `status`, `in_call`, `ringing`                           |

Ejemplo: _cada noche a las 4, si no hay ninguna llamada en curso (`in_call` falso), reinicia
el equipo_.

## Widget del panel

El widget **Equipo OBi** muestra las líneas, los puertos de teléfono y el tiempo activo de
un equipo, con un botón **Reiniciar** (pide confirmación). Elija el equipo en los ajustes
del widget.

## Solución de problemas

- **«inaccesible»**: compruebe la dirección, que el equipo esté encendido y que Gladys esté
  en la misma red.
- **«usuario o contraseña incorrectos»**: inicie sesión en la interfaz web con la misma
  cuenta para comprobar la contraseña.
- **«esta dirección no responde como un equipo OBi»**: la dirección apunta a otro
  dispositivo.
- **No se detecta el timbre**: baje el intervalo de actualización a 5 s o menos.
- **Reinicio rechazado**: use la cuenta `admin`.

## Privacidad

La integración solo habla con los equipos que ha introducido, en su red local. La contraseña
se guarda en un campo secreto de Gladys y nunca se escribe en los registros.
