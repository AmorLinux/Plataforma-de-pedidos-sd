// Despachador con un número fijo de trabajadores (modelo despachador/trabajadores).
import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";
import { ReportePrimos } from "./primos";

function enteroPositivo(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

function enteroNoNegativo(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : porDefecto;
}

const MAX_TRABAJADORES = enteroPositivo(process.env.MAX_TRABAJADORES, os.availableParallelism());
const MAX_COLA = enteroNoNegativo(process.env.MAX_COLA, MAX_TRABAJADORES * 2);
const RUTA_WORKER = path.join(__dirname, "worker-reporte.js");

interface Trabajo {
  n: number;
  resolve: (reporte: ReportePrimos) => void;
  reject: (error: Error) => void;
}

export class PoolLleno extends Error {
  constructor() {
    super("el pool de trabajadores está lleno");
    this.name = "PoolLleno";
  }
}

const cola: Trabajo[] = [];
let activos = 0;
let rechazadas = 0;

function despachar(): void {
  while (activos < MAX_TRABAJADORES && cola.length > 0) {
    lanzar(cola.shift() as Trabajo);
  }
}

function lanzar(trabajo: Trabajo): void {
  activos += 1;
  const worker = new Worker(RUTA_WORKER, { workerData: trabajo.n });
  let liquidado = false;

  const liquidar = (fn: () => void) => {
    if (!liquidado) {
      liquidado = true;
      fn();
    }
  };

  worker.once("message", (reporte: ReportePrimos) => {
    liquidar(() => trabajo.resolve({ ...reporte, modo: "pool" }));
  });
  worker.once("error", (error: Error) => {
    liquidar(() => trabajo.reject(error));
  });
  worker.once("exit", (codigo) => {
    liquidar(() => {
      trabajo.reject(new Error("el worker terminó sin resultado (código " + codigo + ")"));
    });
    activos -= 1;
    despachar();
  });
}

export function contarPrimosEnPool(n: number): Promise<ReportePrimos> {
  return new Promise<ReportePrimos>((resolve, reject) => {
    const trabajo: Trabajo = { n, resolve, reject };

    if (activos < MAX_TRABAJADORES) {
      lanzar(trabajo);
      return;
    }
    if (cola.length < MAX_COLA) {
      cola.push(trabajo);
      return;
    }
    rechazadas += 1;
    reject(new PoolLleno());
  });
}

export function estadoPool() {
  return {
    maxTrabajadores: MAX_TRABAJADORES,
    activos,
    enCola: cola.length,
    maxCola: MAX_COLA,
    rechazadas,
  };
}
