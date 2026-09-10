import { describe, expect, it } from 'vitest'
import { formatFecha, formatFechaCorta, OFFSET_COLOMBIA_MS, parseFecha } from '../lib/fecha'

describe('Fechas en hora de Colombia (UTC-5)', () => {
  it('formatea un instante a la fecha/hora de Colombia', () => {
    // 05:00 UTC = medianoche del mismo día en Colombia.
    expect(formatFecha(new Date('2026-01-05T05:00:00Z'))).toBe('2026-01-05 00:00')
    // 23:30 UTC = 18:30 del mismo día en Colombia.
    expect(formatFecha(new Date('2026-01-05T23:30:00Z'))).toBe('2026-01-05 18:30')
  })

  it('interpreta un texto como hora de Colombia', () => {
    // Colombia a las 00:00 es 05:00 UTC.
    expect(parseFecha('2026-01-05 00:00').getTime()).toBe(Date.UTC(2026, 0, 5, 5, 0))
    expect(parseFecha('2026-06-15 23:45').getTime()).toBe(Date.UTC(2026, 5, 16, 4, 45))
  })

  it('hace round-trip formato -> instante -> formato', () => {
    for (const texto of ['2026-01-05 00:00', '2026-06-15 23:45', '2025-12-31 12:30']) {
      expect(formatFecha(parseFecha(texto))).toBe(texto)
    }
  })

  it('devuelve formato corto en Colombia', () => {
    expect(formatFechaCorta(new Date('2026-01-05T05:00:00Z'))).toBe('05/01/2026')
  })

  it('expone el desplazamiento de Colombia', () => {
    expect(OFFSET_COLOMBIA_MS).toBe(5 * 60 * 60 * 1000)
  })
})