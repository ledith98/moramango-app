/**
 * telefono.ts
 *
 * Comparar teléfonos sin que estorbe el formato.
 *
 * El mismo número se captura de mil maneras —"8117850462", "+52 811 785
 * 0462", "528117850462"— y comparándolos tal cual parecen distintos: así
 * fue como el mismo cliente acabó en dos cuentas. Se comparan siempre por
 * los últimos 10 dígitos, que es el número local.
 */

/** Devuelve los últimos 10 dígitos, o lo que haya si son menos. */
export function claveTelefono(texto: string): string {
  const digitos = (texto || '').replace(/\D/g, '');
  return digitos.length >= 10 ? digitos.slice(-10) : digitos;
}

/** Un número demasiado corto no alcanza para identificar a nadie. */
export function telefonoUtil(texto: string): boolean {
  return claveTelefono(texto).length >= 8;
}

export function mismoTelefono(a: string, b: string): boolean {
  const ca = claveTelefono(a);
  return ca.length > 0 && ca === claveTelefono(b);
}
