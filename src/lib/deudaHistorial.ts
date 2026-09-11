import type { Deuda, PagoDeuda } from '../model/types'

/** Un evento dentro de un día: una venta fiada (cargo) o un abono (pago). */
export interface EventoHistorial {
  tipo: 'DEUDA' | 'PAGO'
  id: string
  descripcion: string
  monto: number
  /** Para un pago, la deuda que abona. */
  deudaId?: string
  deudaSaldada?: boolean
  fecha: string
}

/** Resumen de un día concreto del historial de un deudor. */
export interface DiaDeHistorial {
  /** "yyyy-MM-dd" (parte de fecha del campo `fecha`). */
  dia: string
  /** Eventos del día en orden cronológico. */
  eventos: EventoHistorial[]
  /** Total cargado (fiado) en el día. */
  cargado: number
  /** Total abonado en el día. */
  abonado: number
  /** Saldo acumulado del deudor al cierre del día. */
  saldoAcumulado: number
}

/** Devuelve la parte de fecha (yyyy-MM-dd) de "yyyy-MM-dd HH:mm". */
export function diaDeFecha(fecha: string): string {
  return fecha.slice(0, 10)
}

/** Verdadero si la deuda tiene saldo pendiente por cobrar. */
export function esDeudaActiva(deuda: Deuda): boolean {
  return deuda.saldo > 0
}

/**
 * Agrupa deudas y pagos de un deudor por día, ordenados de más reciente a
 * más antiguo. Cada día suma lo fiado y lo abonado y anota el saldo
 * acumulado del deudor al cierre (derivado, nunca persistido).
 */
export function agruparPorDia(deudas: Deuda[], pagos: PagoDeuda[]): DiaDeHistorial[] {
  const eventos: EventoHistorial[] = [
    ...deudas.map((d) => ({
      tipo: 'DEUDA' as const,
      id: d.id,
      descripcion: d.descripcion,
      monto: d.monto,
      deudaSaldada: !esDeudaActiva(d),
      fecha: d.fecha,
    })),
    ...pagos.map((p) => ({
      tipo: 'PAGO' as const,
      id: p.id,
      descripcion: p.descripcion || 'Abono a cuenta',
      monto: p.monto,
      deudaId: p.deuda_id,
      fecha: p.fecha,
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha))

  const porDia = new Map<string, DiaDeHistorial>()
  let saldo = 0
  for (const evento of eventos) {
    const dia = diaDeFecha(evento.fecha)
    let grupo = porDia.get(dia)
    if (!grupo) {
      grupo = { dia, eventos: [], cargado: 0, abonado: 0, saldoAcumulado: 0 }
      porDia.set(dia, grupo)
    }
    grupo.eventos.push(evento)
    if (evento.tipo === 'DEUDA') {
      grupo.cargado += evento.monto
      saldo += evento.monto
    } else {
      grupo.abonado += evento.monto
      saldo -= evento.monto
    }
    grupo.saldoAcumulado = saldo
  }
  return [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia))
}

/** Devuelve "yyyy-MM-dd" de una fecha (para el filtro del historial). */
export function diaDeFechaActual(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}