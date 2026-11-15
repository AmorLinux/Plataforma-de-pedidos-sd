# Métricas · Interceptor en Pedidos

## Experimento

Fecha: 2026-11-14. Cliente: **Bruno** (https://www.usebruno.com/), un cliente HTTP de escritorio equivalente a Postman e Insomnia. Se usó Bruno porque es local-first y no exige crear cuenta ni iniciar sesión; su columna **Time** mide lo mismo que la de Postman. Las capturas `A.png` y `B.png` se tomaron con Bruno.

| Petición | Código de estado | Tiempo del cliente |
| --- | --- | --- |
| A · `GET /reporte/bloqueante` | 200 | 3,54 s |
| B · `GET /health` (enviada 1,5 s después de A) | 200 | 2,04 s |

La petición A bloquea el bucle de eventos unos 3,5 s calculando primos hasta 5 000 000. La petición B se envió mientras A seguía esperando; por eso su tiempo incluye la espera.

## Respuesta completa de `GET /metricas`

```json
{"umbralLentaMs":1000,"bucle":{"p50Ms":10,"p99Ms":10,"maxMs":3557},"nucleos":8,"pool":{"maxTrabajadores":8,"activos":0,"enCola":0,"maxCola":16,"rechazadas":0},"rutas":[{"ruta":"GET /reporte/bloqueante","peticiones":1,"promedioMs":3541,"maxMs":3541,"lentas":1},{"ruta":"GET /health","peticiones":1,"promedioMs":1,"maxMs":1,"lentas":0}]}
```

La versión final de `/metricas` incluye además `bucle`, `nucleos` y `pool` (del trabajo autónomo); la parte que corresponde a esta tarea es `umbralLentaMs` y `rutas`. La respuesta se tomó en una repetición equivalente del mismo experimento, porque las capturas `A.png` y `B.png` no incluyen la llamada a `/metricas`; los tiempos pueden variar unos milisegundos entre ejecuciones.

## ¿Por qué el cliente y el interceptor miden distinto?

El cliente (Bruno, Postman o el navegador) mide desde que abre la conexión y envía la petición hasta que recibe el cuerpo; por eso `/health` marca 2,04 s: el sistema operativo acepta la conexión, pero Node no puede atenderla mientras el bucle está ocupado con `/reporte/bloqueante`.
El interceptor arranca su cronómetro dentro del middleware, cuando Node ya pudo emitir el evento de la petición, es decir, después de que el bucle se desbloquea; por eso solo ve 1 ms de manejador.
La diferencia (≈2,03 s) es el tiempo de espera en la cola del sistema operativo, que ocurre antes de que Express ejecute `medirLatencia` y que el interceptor no puede observar.
El monitor del bucle sí lo ve: en esa medición, `bucle.maxMs` fue 3557 ms, mientras que `GET /health` en `rutas` quedó en 1 ms.
El fallo que ve el cliente es de latencia e indisponibilidad temporal (fail-slow): la petición no devuelve ningún 5xx, simplemente se queda esperando y puede acabar en timeout si su límite es menor que el bloqueo.
Por eso hace falta medir el bucle desde dentro con `monitorEventLoopDelay`, no solo la duración de los manejadores.
