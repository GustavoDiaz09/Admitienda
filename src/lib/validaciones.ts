/**
 * Utilidades para validar datos de entrada del usuario (port de
 * `tienda.util.Validaciones` de Java). Cada método devuelve un mensaje
 * de error legible, o una cadena vacía cuando el dato es correcto.
 */

/** Valida que un texto no esté vacío ni sea solo espacios. */
export function textoNoVacio(valor: string | null | undefined, nombreCampo: string): string {
  if (valor == null || valor.trim() === '') {
    return `El campo ${nombreCampo} no puede quedar vacío.`
  }
  return ''
}

/**
 * Normaliza un importe escrito en formato español de Colombia a una cadena
 * que `Number()` pueda interpretar. Reglas:
 * - El punto separa miles y la coma es el decimal ("1.250,50" -> "1250.50").
 * - Si conviven ambos, el punto se desecha y la coma pasa a ser decimal.
 * - Con un solo separador: si el grupo siguiente tiene 1-2 dígitos es
 *   decimal ("2.5", "1234,56"); si todos los grupos tienen 3 dígitos son
 *   miles ("2.500" -> "2500", "1.000.000" -> "1000000").
 * - Sin separador se devuelve igual ("2500").
 */
export function normalizarMonto(texto: string | null | undefined): string {
  const limpio = (texto ?? '').trim()
  if (limpio.includes('.') && limpio.includes(',')) {
    return limpio.replace(/\./g, '').replace(',', '.')
  }
  if (limpio.includes('.')) {
    return normalizarSeparador(limpio, '.')
  }
  if (limpio.includes(',')) {
    return normalizarSeparador(limpio, ',')
  }
  return limpio
}

function normalizarSeparador(valor: string, separador: string): string {
  const partes = valor.split(separador)
  if (partes.length > 1 && partes.slice(1).every((p) => /^\d{3}$/.test(p))) {
    return partes.join('')
  }
  return valor.replace(separador, '.')
}

/** Valida que un texto sea un número no negativo (importe monetario). */
export function montoPositivo(valor: string, nombreCampo: string): string {
  const error = textoNoVacio(valor, nombreCampo)
  if (error) {
    return error
  }
  const monto = Number(normalizarMonto(valor))
  if (Number.isNaN(monto)) {
    return `El campo ${nombreCampo} debe contener un número válido.`
  }
  if (monto < 0) {
    return `El campo ${nombreCampo} debe ser un valor positivo.`
  }
  return ''
}

/** Valida que un texto sea un número entero no negativo. */
export function enteroNoNegativo(valor: string, nombreCampo: string): string {
  const error = textoNoVacio(valor, nombreCampo)
  if (error) {
    return error
  }
  const numero = Number(valor.trim())
  if (!Number.isInteger(numero)) {
    return `El campo ${nombreCampo} debe contener un número entero válido.`
  }
  if (numero < 0) {
    return `El campo ${nombreCampo} debe ser un valor positivo.`
  }
  return ''
}

/** Convierte un texto a número, tolerando el formato es-CO (miles y coma). */
export function aDouble(valor: string): number {
  return Number(normalizarMonto(valor))
}

/** Convierte un texto a entero. */
export function aInt(valor: string): number {
  return Number(valor.trim())
}

/** Acumula mensajes de error separándolos con salto de línea. */
export function acumularErrores(errores: string[], nuevo: string): void {
  if (nuevo) {
    errores.push(nuevo)
  }
}