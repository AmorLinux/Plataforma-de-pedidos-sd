# Métricas · Interceptor en Pedidos

## Experimento

Fecha: 2026-11-14. Cliente: `curl -w` (`time_total` es el equivalente a la columna **Time** de Postman).

| Petición | Código de estado | Tiempo del cliente |
| --- | --- | --- |
| A · `GET /reporte/bloqueante` | 200 | 2,315 s |
| B · `GET /health` (enviada 0,4 s después de A) | 200 | 1,936 s |

La petición A bloquea el bucle de eventos unos 2,3 s calculando primos hasta 5 000 000. La petición B se envió mientras A seguía esperando.

## Respuesta completa de `GET /metricas`

```json
{"umbralLentaMs":1000,"rutas":[{"ruta":"GET /reporte/bloqueante","peticiones":1,"promedioMs":2305,"maxMs":2305,"lentas":1},{"ruta":"GET /health","peticiones":1,"promedioMs":1,"maxMs":1,"lentas":0}]}
```

## ¿Por qué el cliente y el interceptor miden distinto?

El cliente mide desde que abre la conexión y envía la petición hasta que recibe el cuerpo; por eso `/health` marca 1,936 s: el sistema operativo acepta la conexión, pero Node no puede atenderla mientras el bucle está ocupado con `/reporte/bloqueante`.
El interceptor arranca su cronómetro dentro del middleware, cuando Node ya pudo emitir el evento de la petición, es decir, después de que el bucle se desbloquea; por eso solo ve 1 ms de manejador.
La diferencia (≈1,93 s) es el tiempo de espera en la cola del sistema operativo, que ocurre antes de que Express ejecute `medirLatencia` y que el interceptor no puede observar.
El fallo que ve el cliente es de latencia e indisponibilidad temporal (fail-slow): la petición no devuelve ningún 5xx, simplemente se queda esperando y puede acabar en timeout si su límite es menor que el bloqueo.
Por eso hace falta medir el bucle desde dentro con `monitorEventLoopDelay`, no solo la duración de los manejadores.
