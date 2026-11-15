// Interceptor que mide cada petición (tarea en clase).
import { Request, Response, NextFunction } from "express";
import { monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
import { estadoPool } from "./pool";

const UMBRAL_LENTA_MS = Number(process.env.UMBRAL_LENTA_MS ?? 1000);

// Mide el retardo del bucle de eventos desde que arranca el proceso.
const retardoBucle = monitorEventLoopDelay({ resolution: 10 });
retardoBucle.enable();

interface Estadistica {
  peticiones: number;
  totalMs: number;
  maxMs: number;
  lentas: number;
}

const porRuta = new Map<string, Estadistica>();

export function medirLatencia(req: Request, res: Response, next: NextFunction): void {
  const inicio = performance.now();
  res.on("finish", () => {
    // TODO 1: calcula la duración en ms
    const duracionMs = performance.now() - inicio;
    // TODO 2: busca la estadística de `${req.method} ${req.path}` (créala si no existe)
    const clave = `${req.method} ${req.path}`;
    const estadistica = porRuta.get(clave) ?? { peticiones: 0, totalMs: 0, maxMs: 0, lentas: 0 };
    // TODO 3: actualiza peticiones, totalMs, maxMs y lentas (ms > UMBRAL_LENTA_MS)
    estadistica.peticiones += 1;
    estadistica.totalMs += duracionMs;
    if (duracionMs > estadistica.maxMs) estadistica.maxMs = duracionMs;
    if (duracionMs > UMBRAL_LENTA_MS) estadistica.lentas += 1;
    porRuta.set(clave, estadistica);
  });
  next(); // sin next(), la petición nunca llega a la ruta
}

export function resumenMetricas() {
  // TODO 4: devuelve { umbralLentaMs, rutas: [{ ruta, peticiones, promedioMs, maxMs, lentas }] }
  return {
    umbralLentaMs: UMBRAL_LENTA_MS,
    bucle: {
      p50Ms: Math.round(retardoBucle.percentile(50) / 1e6),
      p99Ms: Math.round(retardoBucle.percentile(99) / 1e6),
      maxMs: Math.round(retardoBucle.max / 1e6),
    },
    nucleos: os.availableParallelism(),
    pool: estadoPool(),
    rutas: [...porRuta].map(([ruta, e]) => ({
      ruta,
      peticiones: e.peticiones,
      promedioMs: Math.round(e.totalMs / e.peticiones),
      maxMs: Math.round(e.maxMs),
      lentas: e.lentas,
    })),
  };
}
