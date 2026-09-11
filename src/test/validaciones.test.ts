import { describe, expect, it } from 'vitest'
import { aDouble, enteroNoNegativo, montoPositivo, normalizarMonto } from '../lib/validaciones'

describe('Formato de montos es-CO', () => {
  it('interpreta el punto como separador de miles', () => {
    expect(normalizarMonto('2.500')).toBe('2500')
    expect(aDouble('2.500')).toBe(2500)
    expect(aDouble('1.000.000')).toBe(1_000_000)
  })

  it('interpreta la coma como separador decimal', () => {
    expect(aDouble('1234,56')).toBe(1234.56)
    expect(aDouble('12,5')).toBe(12.5)
    expect(normalizarMonto('2,5')).toBe('2.5')
  })

  it('mezcla miles con punto y decimales con coma', () => {
    expect(aDouble('1.250,50')).toBe(1250.5)
    expect(normalizarMonto('1.000.000,00')).toBe('1000000.00')
  })

  it('sin separadores se devuelve el número tal cual', () => {
    expect(aDouble('2500')).toBe(2500)
    expect(aDouble('')).toBe(0)
  })
})

describe('Validación de montos', () => {
  it('acepta importes con formato es-CO', () => {
    expect(montoPositivo('2.500', 'monto')).toBe('')
    expect(montoPositivo('1.250,50', 'monto')).toBe('')
    expect(montoPositivo('100', 'monto')).toBe('')
  })

  it('rechaza texto no numérico y negativos', () => {
    expect(montoPositivo('abc', 'monto')).not.toBe('')
    expect(montoPositivo('-5', 'monto')).not.toBe('')
    expect(montoPositivo('', 'monto')).not.toBe('')
    expect(montoPositivo('1.000.000,00', 'monto')).toBe('')
  })

  it('rechaza importes con más de dos decimales (espejo de la nube)', () => {
    expect(montoPositivo('1,2345', 'monto')).toContain('2 decimales')
    expect(montoPositivo('1.250,505', 'monto')).toContain('2 decimales')
    expect(montoPositivo('1.000,005', 'monto')).toContain('2 decimales')
    expect(montoPositivo('1,23', 'monto')).toBe('')
    expect(montoPositivo('100.00', 'monto')).toBe('')
    expect(montoPositivo('5.000', 'monto')).toBe('')
  })

  it('valida enteros no negativos', () => {
    expect(enteroNoNegativo('100', 'stock')).toBe('')
    expect(enteroNoNegativo('10,5', 'stock')).not.toBe('')
    expect(enteroNoNegativo('-3', 'stock')).not.toBe('')
  })
})