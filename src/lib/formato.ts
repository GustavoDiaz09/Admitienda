/** Formato de dinero para la interfaz (COP, sin decimales, es-CO). */
const formateadorMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Da formato a un monto como moneda colombiana, p. ej. `$ 2.400`. */
export function moneda(monto: number): string {
  return formateadorMoneda.format(Number.isFinite(monto) ? monto : 0)
}

/** Nombres cortos de los días de la semana (clave 0 = Lunes). */
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Nombres cortos de los meses (clave 1 = Enero). */
export const MESES_CORTOS = [
  '',
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

/** Hora local HH:MM de una marca de tiempo (para "última sincronización"). */
export function horaCorta(marcaTiempo: number): string {
  const fecha = new Date(marcaTiempo)
  const a = (n: number): string => String(n).padStart(2, '0')
  return `${a(fecha.getHours())}:${a(fecha.getMinutes())}`
}