/**
 * topePedidos.ts
 *
 * Cuántos pedidos puede mandar una persona seguidos.
 *
 * Para pedir basta con iniciar sesión con Google, y eso lo puede hacer
 * cualquiera. Sin un tope, alguien podría llenar la hoja de pedidos falsos
 * y, de paso, agotar la cuota de lectura de Google —60 por minuto— y dejar
 * la tienda caída para los clientes de verdad.
 *
 * El tope es por persona y generoso a propósito: cinco pedidos en cinco
 * minutos es más de lo que nadie pide de verdad, así que un cliente normal
 * jamás lo toca. Lo que corta es el bucle.
 *
 * Vive en memoria y no en la hoja: escribir un renglón por intento sería
 * gastar la cuota que se quiere proteger. Que se reinicie al desplegar no
 * importa — el ataque que frena dura segundos, no días.
 */

export const CUANTOS = 5;
export const EN_MINUTOS = 5;

const VENTANA = EN_MINUTOS * 60 * 1000;
/** Cuándo pidió cada quien, de lo más viejo a lo más nuevo. */
const intentos = new Map<string, number[]>();

/** Para que la memoria no crezca sin fin si pasan miles de personas. */
const MAXIMO_EN_MEMORIA = 5000;

export interface Veredicto {
  permitido: boolean;
  /** Segundos que faltan para poder volver a pedir */
  esperaSegundos: number;
}

/**
 * ¿Puede esta persona mandar otro pedido?
 *
 * Se llama UNA vez por intento y cuenta ese intento. Llamarla dos veces
 * por el mismo pedido lo contaría doble.
 */
export function puedePedir(quien: string, ahora = Date.now()): Veredicto {
  if (!quien) return { permitido: true, esperaSegundos: 0 };

  const previos = (intentos.get(quien) ?? []).filter((t) => ahora - t < VENTANA);

  if (previos.length >= CUANTOS) {
    const masViejo = previos[0];
    return {
      permitido: false,
      esperaSegundos: Math.max(1, Math.ceil((VENTANA - (ahora - masViejo)) / 1000)),
    };
  }

  previos.push(ahora);
  intentos.set(quien, previos);

  // Limpieza perezosa: solo cuando el mapa creció de más, y solo de lo
  // que ya venció. Barrer en cada pedido costaría más de lo que ahorra.
  if (intentos.size > MAXIMO_EN_MEMORIA) {
    for (const [k, v] of intentos) {
      const vivos = v.filter((t) => ahora - t < VENTANA);
      if (vivos.length === 0) intentos.delete(k);
      else intentos.set(k, vivos);
    }
  }

  return { permitido: true, esperaSegundos: 0 };
}

/** Para las pruebas: olvidar lo contado. */
export function olvidarTodo(): void {
  intentos.clear();
}
