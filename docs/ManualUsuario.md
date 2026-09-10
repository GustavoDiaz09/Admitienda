# Manual de Usuario — AdmiTienda (Web)

AdmiTienda es una aplicación web para administrar una tienda: productos,
ingresos y egresos, resúmenes financieros, usuarios y alertas de inventario.
Funciona **sin conexión** y puede instalarse como una aplicación en el celular
o la computadora.

## 1. Primeros pasos

1. Abre la dirección de la aplicación en el navegador.
2. Inicia sesión con la cuenta que te hayan creado o regístrate con
   **Crear cuenta** (sección 1.1). No existen credenciales por defecto:
   la primera persona que se registre asume automáticamente el rol de
   administrador.
3. Al terminar, cierra la sesión con el botón de la barra superior (esquina
   superior derecha).

### 1.1 Registrarse

1. En la pantalla de ingreso pulsa **Crear cuenta**.
2. Escribe el nombre de usuario, una contraseña (mínimo 6 caracteres) y unas
   **palabras clave de seguridad** que solo tú conozcas y que te ayuden a
   recordar la contraseña si la olvidas. Elígelas de modo que no sean fáciles de
   adivinar (evita tu nombre, fechas de nacimiento u otros datos obvios) para
   mantener tu cuenta protegida.
3. Opcionalmente marca *Solicitar permiso de administrador*. Si ya existe un
   administrador, tu petición queda pendiente de aprobación.

**Los usuarios** pueden consultar (solo lectura) **Resúmenes**, **Productos** y
**Deudas y pagos**; solo los administradores pueden crear, editar o eliminar
esos registros.

> El **primer usuario registrado** del sistema se convierte en administrador
> automáticamente. Los siguientes quedan como usuarios registrados.

### 1.2 Recuperar la contraseña

En la pantalla de ingreso pulsa **¿Olvidaste tu contraseña?**: escribe tu
usuario, confirma las palabras clave de seguridad que registraste y define una
contraseña nueva.

## 2. Roles

| Rol          | Qué puede hacer                                                        |
|--------------|------------------------------------------------------------------------|
| **Invitado** | Entrar como invitado y ver la tabla de productos (solo lectura).       |
| **Registrado**| Ver productos y solicitar permiso de administrador.                   |
| **Administrador** | Todo: productos, movimientos, resúmenes, usuarios y alertas.   |

Como invitado puedes pulsar *Entrar como invitado* en la pantalla de ingreso
para explorar los productos sin registrarte.

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
administrador.

Pestaña **Solicitudes**: aprueba o rechaza las peticiones de permiso de
administrador.

## 7. Módulo de Alertas (administrador)

Resumen de productos en rojo: **agotados** y **stock bajo** (por debajo del
mínimo). Úsalo para planear el reabastecimiento.

## 8. Sincronización con la nube

La aplicación guarda los datos en tu dispositivo y funciona sin internet. La
sincronización la muestran el indicador de la barra superior y el panel del
módulo de Resúmenes:

- **Sincronizar:** sube los cambios pendientes (se hace solo cada 15 s con
  conexión, este botón lo fuerza).
- **Subir todo:** respalda la base completa del dispositivo a la nube. Usadlo
  la primera vez para que otra computadora/celular pueda copiar los datos.
- **Bajar todo (solo administrador):** reemplaza los datos locales con los de
  la nube. Déjalo para cuando configures un dispositivo nuevo.

> Regla de conflictos: si un dato fue modificado en dos lugares, gana la
> versión más reciente.

## 9. Instalar la aplicación (PWA)

- **Computadora (Chrome/Edge):** icono de instalar en la barra de direcciones
  (o menú → "Instalar AdmiTienda").
- **Celular (Android):** menú del navegador → "Agregar a pantalla de inicio".
- **iPhone (Safari):** botón compartir → "Agregar a pantalla de inicio".

Una vez instalada abre en pantalla completa y funciona sin conexión.

## 10. Solución de problemas

- **No entran productos nuevos:** asegúrate de haber iniciado sesión con una
  cuenta de administrador (los invitados y registrados solo ven).
- **La nube no sincroniza:** comprueba la conexión e inténtalo de nuevo
  (el indicador de estado está arriba, a la derecha). La app no se pierde:
  queda todo en tu dispositivo.
- **Perdí la contraseña:** usa la recuperación con el indicio de seguridad.