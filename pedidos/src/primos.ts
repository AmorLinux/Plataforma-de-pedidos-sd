// Cálculo compartido por la ruta bloqueante y por el hilo trabajador.
export interface ReportePrimos {
  modo: string;
  n: number;
  primos: number;
  ms: number;
}

export function contarPrimos(n: number): number {
  let cuenta = 0;
  for (let i = 2; i <= n; i++) {
    let esPrimo = true;
    for (let divisor = 2; divisor * divisor <= i; divisor++) {
      if (i % divisor === 0) {
        esPrimo = false;
        break;
      }
    }
    if (esPrimo) cuenta++;
  }
  return cuenta;
}
