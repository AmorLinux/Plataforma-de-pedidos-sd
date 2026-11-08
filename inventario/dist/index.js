"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const PORT = Number(process.env.PORT ?? 3001);
const RETARDO_MS = Number(process.env.RETARDO_MS ?? 1000);
const stock = new Map([
    ["LAPTOP-14", 5],
    ["MOUSE-USB", 40],
    ["TECLADO-ES", 12],
    ["MONITOR-24", 0]
]);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const app = (0, express_1.default)();
app.use(express_1.default.json());
const reservas = new Map();
app.get("/health", (req, res) => {
    res.json({ status: "ok", servicio: "inventario" });
});
app.get("/stock/:sku", async (req, res) => {
    if (RETARDO_MS > 0)
        await esperar(RETARDO_MS);
    const disponible = stock.get(req.params.sku);
    if (disponible === undefined) {
        res.status(404).json({ error: "SKU no encontrado" });
        return;
    }
    res.json({ sku: req.params.sku, disponible });
});
app.post("/stock/:sku/reservar", async (req, res) => {
    if (RETARDO_MS > 0)
        await esperar(RETARDO_MS);
    const { cantidad } = req.body ?? {};
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
        res.status(400).json({ error: "cantidad invalida" });
        return;
    }
    const sku = req.params.sku;
    const key = req.header("idempotency-key");
    // Idempotencia: si ya procesamos esta clave, devolvemos el mismo resultado
    // sin descontar el stock otra vez. Se consulta después del await para que
    // el tramo comprobar -> descontar -> guardar sea atómico (sin interrupciones).
    if (key) {
        const previa = reservas.get(key);
        if (previa) {
            if (previa.sku !== sku || previa.cantidad !== cantidad) {
                res.status(409).json({ error: "idempotency-key reutilizada con otros datos" });
                return;
            }
            res.status(201).json({ sku, reservado: previa.cantidad, restante: previa.restante });
            return;
        }
    }
    const disponible = stock.get(sku);
    if (disponible === undefined) {
        res.status(404).json({ error: "SKU no encontrado" });
        return;
    }
    if (disponible < cantidad) {
        res.status(409).json({ error: "stock insuficiente", restante: disponible });
        return;
    }
    const nuevo = disponible - cantidad;
    stock.set(sku, nuevo);
    if (key)
        reservas.set(key, { sku, cantidad, restante: nuevo });
    res.status(201).json({ sku, reservado: cantidad, restante: nuevo });
});
app.listen(PORT, () => {
    console.log("servicio inventario escuchando en el puerto " + PORT + " retraso " + RETARDO_MS);
});
