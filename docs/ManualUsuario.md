# Manual de Usuario — AdmiTienda (Web)

AdmiTienda es una aplicación web para administrar una tienda: productos,
ingresos y egresos, resúmenes financieros, usuarios y alertas de inventario.
Funciona **sin conexión** y puede instalarse como una aplicación en el celular
o la computadora.

## 1. Primeros pasos

1. Abre la dirección de la aplicación en el navegador.
2. La aplicación inicia totalmente vacía: sin cuentas ni datos. Crea la primera
   cuenta con **Crear cuenta** (sección 1.1): quien se registre **primero**
   asume automáticamente el rol de **administrador**.
3. Al terminar, cierra la sesión con el botón de la barra superior (esquina
   superior derecha).

### 1.1 Registrarse

1. En la pantalla de ingreso pulsa **Crear cuenta**.
2. Escribe el nombre de usuario, una contraseña (mínimo 6 caracteres) y unas
   **palabras clave de seguridad** que solo tú conozcas y que te ayuden a
   recordar la contraseña si la olvidas. Elígelas de modo que no sean fáciles de
   adivinar (evita tu nombre, fechas de nacimiento u otros datos obvios) para
   mantener tu cuenta protegida.
3. Si ya existe un administrador y quieres serlo, marca *Solicitar permiso de
   administrador*: tu petición queda pendiente de aprobación.

**Los usuarios** pueden consultar (solo lectura) **Resúmenes**, **Productos**,
**Ingresos y egresos** y **Deudas y pagos**; solo los administradores pueden
crear, editar o eliminar esos registros.

> Cualquier persona puede registrarse. La **primera cuenta de todo el sistema**
> es la administradora (la nube lo confirma). Si ya existe un administrador, o
> el dispositivo no puede confirmarlo, quedas como usuario registrado (solo
> lectura) hasta que un administrador apruebe tu permiso.

### 1.2 Recuperar la contraseña

En la pantalla de ingreso pulsa **¿Olvidaste tu contraseña?**: escribe tu
usuario, confirma las palabras clave de seguridad que registraste y define una
contraseña nueva.

## 2. Roles

| Rol          | Qué puede hacer                                                        |
|--------------|------------------------------------------------------------------------|
| **Invitado** | Entrar como invitado y ver la tabla de productos (solo lectura).       |
| **Registrado**| Consultar en solo lectura Resúmenes, Productos, Ingresos y egresos y Deudas; solicitar permiso de administrador. |
| **Administrador** | Todo: productos, movimientos, resúmenes, usuarios y alertas.   |
| **Superadministrador** | Cuenta única del dueño del sistema. Todo lo del administrador y además puede dar/quitar el rol de administrador a otros usuarios y eliminar administradores (incluso el último). Su cuenta es inamovible: no se elimina, no se renombra ni cambia de rol. |

Como invitado puedes pulsar *Entrar como invitado* en la pantalla de ingreso
para explorar los productos sin registrarte. La cuenta de superadministrador no
se registra desde la aplicación: es la cuenta del dueño, activada una sola vez
en la nube y repartida a los dispositivos mediante la sincronización.

## 3. Módulo de Productos

- Usa el buscador para filtrar por nombre y el selector para ver todos, los de
  **stock bajo** o los **agotados**.
- **Agregar:** pulsa *Nuevo producto* y completa tipo, nombre, precio neto,
  ganancia, precio de venta (se autocalcula con neto + ganancia si lo dejas en
  0), cantidad en stock y stock mínimo.
- **Editar / Eliminar:** botones al final de la fila. Eliminar pide confirmación
  (borrado lógico).

## 4. Módulo de Movimientos (ingresos y egresos)

- **Nuevo movimiento:** elige *Ingreso* o *Egreso*, escribe el monto y la
  descripción. Se guarda con la fecha actual.
- El historial se filtra por tipo (todos / ingresos / egresos) y se ordena del
  más reciente al más antiguo, con montos en pesos colombianos.
- **Editar / Eliminar** como en productos.

## 5. Módulo de Resúmenes

Muestra los totales del período:
- **Ingresos**, **egresos** y **balance neto** hasta hoy.
- **Resumen de la semana:** saldo neto por día (lunes a domingo).
- **Resumen del año:** saldo neto por mes.
- Una tarjeta de **sincronización** indica si hay conexión y cuántos cambios
  están pendientes de subir a la nube.

## 6. Módulo de Usuarios (administrador)

Pestaña **Usuarios**: lista los usuarios activos; puedes modificarlos
(renombrar, cambiar el indicio) o eliminarlos. No se puede eliminar el último
administrador (salvo que quien lo hace sea el superadministrador).

Si tu cuenta es **superadministrador**, en cada fila de un usuario registrado
verás un botón para **hacerlo administrador** y, en la de los administradores,
otro para **quitarle el rol** (queda como registrado). De esta forma puedes
conceder o retirar el permiso de administrador directamente, sin pasar por la
pestaña de Solicitudes. La cuenta del superadministrador no se puede eliminar
ni modificar por otra cuenta.

Pestaña **Solicitudes**: aprueba o rechaza las peticiones de permiso de
administrador.

## 7. Módulo de Alertas (administrador)

Resumen de productos en rojo: **agotados** y **stock bajo** (por debajo del
mínimo). Úsalo para planear el reabastecimiento.

## 8. Sincronización con la nube

La aplicación guarda los datos en tu dispositivo y funciona sin internet. La
sincronización la muestran el indicador de la barra superior y el panel del
módulo de Resúmenes:

- **Llave de sincronización** (se configura UNA vez por dispositivo, quien la
  tenga puede guardar y descargar los datos): abre el indicador de
  sincronización (arriba, a la derecha), escribe la llave que te entregó el
  administrador y pulsa **Guardar**. Solo la cuenta de **superadministrador**
  puede generar llaves nuevas para otros dispositivos: si necesitas una,
  pídesela al dueño (te dará una de "agregar otro dispositivo").
- **Sincronizar:** sube los cambios pendientes (en cuanto hay conexión se hace
  solo, con reintentos; este botón lo fuerza).
- **Subir todo:** respalda la base completa del dispositivo a la nube. Usadlo
  la primera vez para que otra computadora/celular pueda copiar los datos.
- **Bajar todo (solo administrador):** fusiona la nube con este dispositivo.
  En cada dato gana la versión más reciente y no se pierden los cambios
  locales pendientes; úsalo cuando configures un dispositivo nuevo.
- **Bajada automática:** con la llave configurada y conexión, la aplicación
  además **baja por su cuenta los cambios nuevos** de la nube (una vez al
  arrancar, al volver a conectarse y aproximadamente cada 30 s). Así, cuando
  se modifica algo en otro dispositivo, en este se refleja solo, sin tocar
  nada; la fusión sigue siendo la misma (gana la versión más reciente).

> Regla de conflictos: si un dato fue modificado en dos lugares, gana la
> versión más reciente. Los importes se escriben en formato colombiano (punto
> para miles y coma para decimales: "2.500" o "1.250,50").

> Entrar en un dispositivo nuevo: puedes iniciar sesión con tu usuario y
> contraseña **aunque todavía no tengas la llave** (la aplicación verifica tu
> cuenta en la nube). La llave solo es necesaria para que los datos de la
> tienda viajen entre dispositivos; pídela al administrador desde una sesión
> ya iniciada.

> Si la nube rechaza un dato (por ejemplo, un nombre de usuario que ya existe
> en otro dispositivo), la aplicación deja de intentarlo y muestra el motivo en
> el panel de sincronización; el dato sigue en tu dispositivo pero no viaja a
> los demás.

## 9. Instalar la aplicación (PWA)

- **Computadora (Chrome/Edge):** icono de instalar en la barra de direcciones
  (o menú → "Instalar AdmiTienda").
- **Celular (Android):** menú del navegador → "Agregar a pantalla de inicio".
- **iPhone (Safari):** botón compartir → "Agregar a pantalla de inicio".

Una vez instalada abre en pantalla completa y funciona sin conexión.

## 10. Solución de problemas

- **No entran productos nuevos:** asegúrate de haber iniciado sesión con una
  cuenta de administrador (los invitados y registrados solo ven).
- **La nube no sincroniza:** comprueba que hayas guardado la **llave de
  sincronización** de este dispositivo en el panel de sincronización y que la
  llave sea correcta; luego comprueba la conexión e inténtalo de nuevo (el
  indicador de estado está arriba, a la derecha). La app no se pierde: queda
  todo en tu dispositivo.
- **Perdí la contraseña:** usa la recuperación con el indicio de seguridad.