/**
 * Utilidades de fechas (port de los formatos `yyyy-MM-dd HH:mm` usados
 * en las entidades Java de Sistema Tienda).
 *
 * Las fechas se interpretan y muestran siempre en hora de Colombia
 * (UTC-5, sin horario de verano), de modo que el mismo movimiento se lee
 * igual desde cualquier zona horaria del dispositivo.
 */

/** Desplazamiento de Colombia respecto a UTC en milisegundos (UTC-5). */
export const OFFSET_COLOMBIA_MS = 5 * 60 * 60 * 1000

/** Instante expresado en el "reloj de pared" de Colombia. */
function enColombia(fecha: Date): Date {
  return new Date(fecha.getTime() - OFFSET_COLOMBIA_MS)
}

/** Da formato "yyyy-MM-dd HH:mm" a una fecha (hora de Colombia). */
export function formatFecha(fecha: Date): string {
  const c = enColombia(fecha)
  const a = (n: number): string => String(n).padStart(2, '0')
  return (
    `${c.getUTCFullYear()}-${a(c.getUTCMonth() + 1)}-${a(c.getUTCDate())}` +
    ` ${a(c.getUTCHours())}:${a(c.getUTCMinutes())}`
  )
}

/** Interpreta un texto "yyyy-MM-dd HH:mm" como instante (hora de Colombia). */
export function parseFecha(texto: string): Date {
  const [fecha, hora = '00:00'] = texto.split(' ')
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const [hh, mm] = hora.split(':').map(Number)
  return new Date(Date.UTC(anio, (mes ?? 1) - 1, dia ?? 1, (hh ?? 0) + 5, mm ?? 0))
}

/** Formatea una fecha como día/mes/año para mostrar en la interfaz. */
export function formatFechaCorta(fecha: Date): string {
  const c = enColombia(fecha)
  const a = (n: number): string => String(n).padStart(2, '0')
  return `${a(c.getUTCDate())}/${a(c.getUTCMonth() + 1)}/${c.getUTCFullYear()}`
}