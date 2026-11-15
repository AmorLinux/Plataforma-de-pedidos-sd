// Un hilo trabajador por petición (práctica guiada).
import { parentPort, workerData } from "node:worker_threads";
import { contarPrimos, ReportePrimos } from "./primos";

const n = Number(workerData);
const inicio = performance.now();
const primos = contarPrimos(n);
const ms = Math.round(performance.now() - inicio);

const reporte: ReportePrimos = { modo: "worker", n, primos, ms };
parentPort?.postMessage(reporte);
