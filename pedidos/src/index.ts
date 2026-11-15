import express, {Request, Response} from "express"
import {randomUUID} from "node:crypto"
import path from "node:path"
import {Worker} from "node:worker_threads"
import {contarPrimos} from "./primos"
import {medirLatencia, resumenMetricas} from "./metricas"
import {contarPrimosEnPool, estadoPool, PoolLleno} from "./pool"

const PORT = Number(process.env.PORT ?? 3000);
const INVENTARIO_URL = process.env.INVENTARIO_URL ?? "http://localhost:3001";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 2000);
const READINESS_TIMEOUT_MS = 1000;
const N_REPORTE_POR_DEFECTO = 5_000_000;
const N_REPORTE_MAXIMO = 50_000_000;

interface Pedido{
    id:string;
    sku:string;
    cantidad:number;
    creadoEn:string;
}

const pedidos:Pedido [] = [];

const app = express();

app.use(express.json());

// Interceptor de métricas: debe ir después de express.json() y antes de las rutas.
app.use(medirLatencia);

app.get("/metricas", (req:Request, res:Response) => {
    res.json(resumenMetricas());
});

function leerN(valor: unknown): number {
    const n = valor === undefined ? N_REPORTE_POR_DEFECTO : Number(valor);
    if (!Number.isInteger(n) || n < 0 || n > N_REPORTE_MAXIMO) {
        throw new RangeError("n debe ser un entero entre 0 y " + N_REPORTE_MAXIMO);
    }
    return n;
}

// Reporte que congela el bucle de eventos mientras calcula (práctica guiada).
app.get("/reporte/bloqueante", (req:Request, res:Response) => {
    let n: number;
    try {
        n = leerN(req.query.n);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
        return;
    }
    const inicio = performance.now();
    const primos = contarPrimos(n);
    const ms = Math.round(performance.now() - inicio);
    res.json({ modo: "bloqueante", n, primos, ms });
});

// El mismo reporte, pero en un hilo trabajador (práctica guiada).
app.get("/reporte/worker", (req:Request, res:Response) => {
    let n: number;
    try {
        n = leerN(req.query.n);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
        return;
    }
    const worker = new Worker(path.join(__dirname, "worker-reporte.js"), { workerData: n });
    let respondido = false;
    const responder = (fn: () => void) => {
        if (!respondido) {
            respondido = true;
            fn();
        }
    };
    worker.once("message", (reporte) => responder(() => res.json(reporte)));
    worker.once("error", (error: Error) => responder(() => {
        res.status(500).json({ error: "el worker falló", detalle: error.message });
    }));
    worker.once("exit", (codigo) => {
        if (codigo !== 0) {
            responder(() => {
                res.status(500).json({ error: "el worker terminó con código " + codigo });
            });
        }
    });
});

// El mismo reporte, pero con un número fijo de trabajadores y cola limitada.
app.get("/reporte/pool", async (req:Request, res:Response) => {
    let n: number;
    try {
        n = leerN(req.query.n);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
        return;
    }
    try {
        const reporte = await contarPrimosEnPool(n);
        res.json(reporte);
    } catch (error) {
        if (error instanceof PoolLleno) {
            res.setHeader("Retry-After", "1");
            res.status(503).json({ error: error.name, mensaje: error.message, pool: estadoPool() });
            return;
        }
        res.status(500).json({ error: "el worker falló", detalle: (error as Error).message });
    }
});

app.get("/health", (req:Request, res:Response) => {
    res.json({status: "ok", servicio: "pedidos"});
});

app.get("/health/ready", async (req:Request, res:Response) => {
    const inicio = performance.now();
    try {
        const r = await fetch(INVENTARIO_URL + "/health", {
            signal: AbortSignal.timeout(READINESS_TIMEOUT_MS),
        });
        const ms = Math.round(performance.now() - inicio);
        if (!r.ok) {
            res.status(503).json({ status: "no-listo", inventario: "inventario respondió " + r.status, ms });
            return;
        }
        res.json({ status: "listo", inventario: "ok", ms });
    } catch (error) {
        const ms = Math.round(performance.now() - inicio);
        const e = error as Error & { cause?: { code?: string } };
        const motivo = e.name === "TimeoutError"
            ? "inventario no respondió en " + READINESS_TIMEOUT_MS + " ms"
            : "No se pudo conectar con Inventario " + (e.cause?.code ?? e.message);
        res.status(503).json({ status: "no-listo", inventario: motivo, ms });
    }
});

app.get("/pedidos", (req:Request, res:Response) => {
    res.json(pedidos);
});

app.post("/pedidos", async(req:Request, res:Response) => {
    const body = req.body ?? {};
    const sku = typeof body.sku === "string" ? body.sku.trim() : body.sku;
    const cantidad = body.cantidad;

    if (typeof sku !== "string" || sku.length === 0 || !Number.isInteger(cantidad) || cantidad <= 0) {
        res.status(400).json({ error: "sku y cantidad no son los tipos de datos correctos" });
        return;
    }
    const id: string = typeof body.id === "string" && body.id.length > 0 ? body.id : randomUUID();
    const existente = pedidos.find((p) => p.id === id);
    if (existente) {
        res.status(200).json(existente);
        return;
    }
    const inicio = performance.now();
    try {
        const r = await fetch(
            INVENTARIO_URL + "/stock/" + encodeURIComponent(sku) + "/reservar",
            {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": id },
            body: JSON.stringify({ cantidad }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            }
        );

        if (r.status === 404) { res.status(400).json({ error: "sku no encontrado en inventario " + sku }); return; }
        if (r.status === 409) {
            const detalle = await r.json().catch(() => ({}));
            res.status(409).json(detalle);
            return;
        }
        if (!r.ok)            { res.status(503).json({ error: "inventario respondió " + r.status }); return; }

        const pedido: Pedido = { id, sku, cantidad, creadoEn: new Date().toISOString() };
        pedidos.push(pedido);
        res.status(201).json(pedido);   // ← ojo: antes mandabas el array completo
    
    } catch (error) {
        const duracionMs = Math.round(performance.now() -inicio);
        const e = error as Error & { cause ?: { code?:string }};
        const motivo = e.name === "TimeoutError"
        ? "inventario no respondio en " + TIMEOUT_MS + " ms":
        "No se pudo conectar con Inventario " + (e.cause?.code ?? e.message);
        console.error("pedidos " + motivo);
        res.status(503).json({error: "inventario no disponible ", motivo, duracionMs, id});
    }
    
});

app.listen(PORT, () =>{
    console.log("pedidos en el puerto " + PORT + " inventario en " + INVENTARIO_URL + " TIMEOUT_MS " + TIMEOUT_MS)
});