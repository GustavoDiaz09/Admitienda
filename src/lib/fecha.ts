/**
 * Utilidades de fechas (port de los formatos `yyyy-MM-dd HH:mm` usados
 * en las entidades Java de Sistema Tienda).
 */

/** Da formato local "yyyy-MM-dd HH:mm" a una fecha (compatible con Java). */
export function formatFecha(fecha: Date): string {
  const a = (n: number): string => String(n).padStart(2, '0')
  return (
    `${fecha.getFullYear()}-${a(fecha.getMonth() + 1)}-${a(fecha.getDate())}` +
    ` ${a(fecha.getHours())}:${a(fecha.getMinutes())}`
  )
}

/** Interpreta un texto "yyyy-MM-dd HH:mm" como Date local. */
export function parseFecha(texto: string): Date {
  const [fecha, hora = '00:00'] = texto.split(' ')
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const [hh, mm] = hora.split(':').map(Number)
  return new Date(anio, (mes ?? 1) - 1, dia ?? 1, hh ?? 0, mm ?? 0)
}

/** Formatea una fecha como día/mes/año para mostrar en la interfaz. */
export function formatFechaCorta(fecha: Date): string {
  const a = (n: number): string => String(n).padStart(2, '0')
  return `${a(fecha.getDate())}/${a(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
}