"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const node_crypto_1 = require("node:crypto");
const PORT = Number(process.env.PORT ?? 3000);
const INVENTARIO_URL = process.env.INVENTARIO_URL ?? "http://localhost:3001";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 2000);
const READINESS_TIMEOUT_MS = 1000;
const pedidos = [];
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get("/health", (req, res) => {
    res.json({ status: "ok", servicio: "pedidos" });
});
app.get("/health/ready", async (req, res) => {
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
    }
    catch (error) {
        const ms = Math.round(performance.now() - inicio);
        const e = error;
        const motivo = e.name === "TimeoutError"
            ? "inventario no respondió en " + READINESS_TIMEOUT_MS + " ms"
            : "No se pudo conectar con Inventario " + (e.cause?.code ?? e.message);
        res.status(503).json({ status: "no-listo", inventario: motivo, ms });
    }
});
app.get("/pedidos", (req, res) => {
    res.json(pedidos);
});
app.post("/pedidos", async (req, res) => {
    const body = req.body ?? {};
    const sku = typeof body.sku === "string" ? body.sku.trim() : body.sku;
    const cantidad = body.cantidad;
    if (typeof sku !== "string" || sku.length === 0 || !Number.isInteger(cantidad) || cantidad <= 0) {
        res.status(400).json({ error: "sku y cantidad no son los tipos de datos correctos" });
        return;
    }
    const id = typeof body.id === "string" && body.id.length > 0 ? body.id : (0, node_crypto_1.randomUUID)();
    const existente = pedidos.find((p) => p.id === id);
    if (existente) {
        res.status(200).json(existente);
        return;
    }
    const inicio = performance.now();
    try {
        const r = await fetch(INVENTARIO_URL + "/stock/" + encodeURIComponent(sku) + "/reservar", {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": id },
            body: JSON.stringify({ cantidad }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (r.status === 404) {
            res.status(400).json({ error: "sku no encontrado en inventario " + sku });
            return;
        }
        if (r.status === 409) {
            const detalle = await r.json().catch(() => ({}));
            res.status(409).json(detalle);
            return;
        }
        if (!r.ok) {
            res.status(503).json({ error: "inventario respondió " + r.status });
            return;
        }
        const pedido = { id, sku, cantidad, creadoEn: new Date().toISOString() };
        pedidos.push(pedido);
        res.status(201).json(pedido); // ← ojo: antes mandabas el array completo
    }
    catch (error) {
        const duracionMs = Math.round(performance.now() - inicio);
        const e = error;
        const motivo = e.name === "TimeoutError"
            ? "inventario no respondio en " + TIMEOUT_MS + " ms" :
            "No se pudo conectar con Inventario " + (e.cause?.code ?? e.message);
        console.error("pedidos " + motivo);
        res.status(503).json({ error: "inventario no disponible ", motivo, duracionMs, id });
    }
});
app.listen(PORT, () => {
    console.log("pedidos en el puerto " + PORT + " inventario en " + INVENTARIO_URL + " TIMEOUT_MS " + TIMEOUT_MS);
});
