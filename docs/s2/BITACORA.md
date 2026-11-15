# Bitácora · Arquitecturas y procesos · Ariel Moreira

## Entorno

| Dato | Valor |
| --- | --- |
| Laptop (CPU, RAM) | Intel Core i5-8350U (4 núcleos, 8 hilos) · 15 GiB de RAM |
| nucleos según /metricas | 8 |
| MAX_TRABAJADORES y MAX_COLA | 8 y 16 (valores por defecto; `os.availableParallelism()` = 8) |
| Duración de un reporte con n=2000000 | 701 ms de cálculo en el worker; 0,80 s de extremo a extremo |

Cliente HTTP de las pruebas: `curl -w` (equivalente a la columna **Time** de Postman; no había interfaz gráfica en el entorno). Las cargas se lanzaron con `npx -y autocannon@8`. Docker en este equipo es Podman con el proveedor `docker-compose`.

## 1. Resultados

| Escenario | Latencia 50 % | Latencia máx. | Respuestas 2xx | Respuestas 503 | Timeouts | bucle.maxMs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 · bloqueo (/health) | 2 ms | 2360 ms | 86 993 | 0 | 0 | 2361 |
| 2 · worker sin límite | 6628 ms | 9202 ms | 18 | 0 | 86 | 309 |
| 3 · pool con límite | 10 ms | 6605 ms | 80 | 42 444 | 0 | 81 |

Notas de lectura:

- Escenario 1: autocannon envió 87 000 peticiones y no reportó errores ni non-2xx; `/metricas` registró 86 993 respuestas de `/health` (las que alcanzaron a terminar antes de leer las métricas).
- Escenario 2: autocannon envió 153 peticiones; 86 terminaron en timeout y solo 18 respuestas 2xx llegaron a completarse. Las demás seguían en vuelo cuando autocannon cerró las conexiones a los 20 s.
- Escenario 3: 80 respuestas 2xx (los trabajos que entraron al pool) y 42 444 respuestas 503 (cola llena); no hubo timeouts.

### Escenario 1 · bloqueo

Salida de autocannon:

```text
Running 15s test @ http://localhost:3000/health
20 connections


┌─────────┬──────┬──────┬───────┬──────┬─────────┬──────────┬─────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev    │ Max     │
├─────────┼──────┼──────┼───────┼──────┼─────────┼──────────┼─────────┤
│ Latency │ 1 ms │ 2 ms │ 5 ms  │ 6 ms │ 2.95 ms │ 49.04 ms │ 2360 ms │
└─────────┴──────┴──────┴───────┴──────┴─────────┴──────────┴─────────┘
┌───────────┬─────┬──────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│ Stat      │ 1%  │ 2.5% │ 50%     │ 97.5%   │ Avg     │ Stdev   │ Min     │
├───────────┼─────┼──────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Req/Sec   │ 0   │ 0    │ 7863    │ 9903    │ 5798,8  │ 3718,2  │ 40      │
├───────────┼─────┼──────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Bytes/Sec │ 0 B │ 0 B  │ 2.13 MB │ 2.68 MB │ 1.57 MB │ 1.01 MB │ 10.8 kB │
└───────────┴─────┴──────┴─────────┴─────────┴─────────┴─────────┴─────────┘

Req/Bytes counts sampled once per second.
# of samples: 15

87k requests in 15.04s, 23.6 MB read
```

Peticiones bloqueantes lanzadas durante la carga:

```text
bloqueante1 status=200 time=2.218305s
bloqueante2 status=200 time=4.377591s
```

Respuesta de `/metricas`:

```json
{"umbralLentaMs":1000,"bucle":{"p50Ms":10,"p99Ms":13,"maxMs":2361},"nucleos":8,"pool":{"maxTrabajadores":8,"activos":0,"enCola":0,"maxCola":16,"rechazadas":0},"rutas":[{"ruta":"GET /health","peticiones":86993,"promedioMs":0,"maxMs":6,"lentas":0},{"ruta":"GET /reporte/bloqueante","peticiones":2,"promedioMs":2284,"maxMs":2355,"lentas":2}]}
```

### Escenario 2 · worker sin límite

Salida de autocannon:

```text
Running 20s test @ http://localhost:3000/reporte/worker?n=2000000
50 connections

(node:21484) TimeoutNegativeWarning: -2 is a negative number.
Timeout duration was set to 1.
(Use `node --trace-warnings ...` to show where the warning was created)

┌─────────┬─────────┬─────────┬─────────┬─────────┬───────────┬────────────┬─────────┐
│ Stat    │ 2.5%    │ 50%     │ 97.5%   │ 99%     │ Avg       │ Stdev      │ Max     │
├─────────┼─────────┼─────────┼─────────┼─────────┼───────────┼────────────┼─────────┤
│ Latency │ 1717 ms │ 6628 ms │ 9202 ms │ 9202 ms │ 6205.3 ms │ 2310.26 ms │ 9202 ms │
└─────────┴─────────┴─────────┴─────────┴─────────┴───────────┴────────────┴─────────┘
┌───────────┬─────┬──────┬───────┬───────┬───────┬───────┬───────┐
│ Stat      │ 1%  │ 2.5% │ 50%   │ 97.5% │ Avg   │ Stdev │ Min   │
├───────────┼─────┼──────┼───────┼───────┼───────┼───────┼───────┤
│ Req/Sec   │ 0   │ 0    │ 1     │ 3     │ 0,85  │ 0,86  │ 1     │
├───────────┼─────┼──────┼───────┼───────┼───────┼───────┼───────┤
│ Bytes/Sec │ 0 B │ 0 B  │ 290 B │ 870 B │ 247 B │ 247 B │ 290 B │
└───────────┴─────┴──────┴───────┴───────┴───────┴───────┴───────┘

Req/Bytes counts sampled once per second.
# of samples: 20

153 requests in 20.17s, 4.93 kB read
86 errors (86 timeouts)
```

Respuesta de `/metricas`:

```json
{"umbralLentaMs":1000,"bucle":{"p50Ms":10,"p99Ms":60,"maxMs":309},"nucleos":8,"pool":{"maxTrabajadores":8,"activos":0,"enCola":0,"maxCola":16,"rechazadas":0},"rutas":[{"ruta":"GET /reporte/worker","peticiones":18,"promedioMs":6114,"maxMs":9371,"lentas":18}]}
```

### Escenario 3 · pool con límite

Salida de autocannon:

```text
Running 20s test @ http://localhost:3000/reporte/pool?n=2000000
50 connections


┌─────────┬──────┬───────┬───────┬───────┬─────────┬───────────┬─────────┐
│ Stat    │ 2.5% │ 50%   │ 97.5% │ 99%   │ Avg     │ Stdev     │ Max     │
├─────────┼──────┼───────┼───────┼───────┼─────────┼───────────┼─────────┤
│ Latency │ 4 ms │ 10 ms │ 30 ms │ 40 ms │ 21.4 ms │ 228.27 ms │ 6605 ms │
└─────────┴──────┴───────┴───────┴───────┴─────────┴───────────┴─────────┘
┌───────────┬────────┬────────┬────────┬─────────┬─────────┬────────┬────────┐
│ Stat      │ 1%     │ 2.5%   │ 50%    │ 97.5%   │ Avg     │ Stdev  │ Min    │
├───────────┼────────┼────────┼────────┼─────────┼─────────┼────────┼────────┤
│ Req/Sec   │ 732    │ 732    │ 2341   │ 2985    │ 2126,56 │ 567,57 │ 732    │
├───────────┼────────┼────────┼────────┼─────────┼─────────┼────────┼────────┤
│ Bytes/Sec │ 308 kB │ 308 kB │ 990 kB │ 1.26 MB │ 898 kB  │ 241 kB │ 308 kB │
└───────────┴────────┴────────┴────────┴─────────┴─────────┴────────┴────────┘

Req/Bytes counts sampled once per second.
# of samples: 20

80 2xx responses, 42444 non 2xx responses
43k requests in 20.15s, 18 MB read
```

Respuesta de `/metricas`:

```json
{"umbralLentaMs":1000,"bucle":{"p50Ms":12,"p99Ms":31,"maxMs":81},"nucleos":8,"pool":{"maxTrabajadores":8,"activos":8,"enCola":10,"maxCola":16,"rechazadas":42470},"rutas":[{"ruta":"GET /reporte/pool","peticiones":42550,"promedioMs":10,"maxMs":6534,"lentas":80}]}
```

## 2. Análisis

### 1. En el escenario 1, ¿qué valor tuvo bucle.maxMs y cuál fue el maxMs de GET /health en rutas? ¿Por qué uno ve el bloqueo y el otro no?

`bucle.maxMs` fue **2361 ms**, mientras que el `maxMs` de `GET /health` en `rutas` fue **6 ms**. El monitor mide el retardo del propio bucle: el cálculo de primos de `/reporte/bloqueante` lo mantuvo ocupado unos 2,3 s y `monitorEventLoopDelay` registró ese hueco de forma directa. El interceptor, en cambio, arranca su cronómetro cuando Node ya puede ejecutar el middleware, es decir, después de que el bucle se desbloquea; por eso solo ve el tiempo del manejador de `/health`. El cliente sí percibe la espera (autocannon reportó un máximo de 2360 ms; las dos peticiones bloqueantes tardaron 2,22 s y 4,38 s) porque su medida incluye la conexión y la cola del sistema operativo. Es un fallo de latencia y disponibilidad temporal (fail-slow), no un error 5xx.

### 2. En el escenario 2, ¿cuántas peticiones se completaron y cuántas terminaron en timeout? Si un reporte solo tarda menos de un segundo, ¿por qué con 50 a la vez pasa eso?

autocannon envió **153 peticiones**: **86 terminaron en timeout** y el servidor alcanzó a registrar **18 respuestas 2xx**; el resto seguía en vuelo cuando la prueba se cortó a los 20 s. Un reporte de `n=2000000` tarda unos **0,70 s de CPU**, pero con 50 peticiones simultáneas en 8 núcleos hay una sobrecarga de aproximadamente 6,25×, así que la latencia mediana subió a **6628 ms** y muchas superaron el timeout de 10 s. Además, crear un worker por petición multiplica el costo de arranque y los cambios de contexto; `bucle.maxMs` llegó a **309 ms**. El resultado es un fail-slow: el servidor sigue vivo, pero cada vez más lento y con conexiones colgadas.

### 3. En el escenario 3, ¿cuántas respuestas fueron 2xx y cuántas 503? Para el cliente, ¿qué diferencia hay entre un 503 inmediato con Retry-After y un timeout? Usa los modelos de fallo.

En el escenario 3 hubo **80 respuestas 2xx** y **42 444 respuestas 503**, sin timeouts. Los 2xx son los trabajos que sí cupieron en el pool (8 activos + 16 en cola) y tardaron hasta 6605 ms; los 503 los devolvió el despachador de inmediato cuando la cola estaba llena. Para el cliente, un **503 con `Retry-After`** es un fallo rápido y explícito (fail-fast): sabe que el servidor está saturado y que puede reintentar en 1 s. Un **timeout** es un fallo lento (fail-slow): el cliente espera 10 s sin saber si el servidor está vivo, ocupa la conexión y puede reintentar a ciegas. El 503 protege al servidor; el timeout lo castiga.

### 4. autocannon ignora Retry-After y reintenta enseguida. ¿Qué efecto tuvo eso en el servidor y qué debería hacer un cliente bien diseñado?

autocannon ignora `Retry-After` y reintenta en cuanto recibe el 503, así que en 20 s generó **42 444 non-2xx** y **42 470 rechazos** en el pool, manteniendo los **8 trabajadores activos y 10 trabajos en cola** al terminar. El 503 es barato, pero la tormenta de reintentos consume CPU, sockets y tiempo del bucle (`bucle.maxMs` 81 ms) y no deja que la cola se drene. Un cliente bien diseñado debería respetar `Retry-After`, usar **backoff exponencial con jitter**, limitar el número de reintentos, aplicar un **circuit breaker** y, si puede, encolar o priorizar el trabajo localmente. También debería distinguir un 503 (reintentable) de un 400 o 409 (no reintentable).

### 5. Las métricas y la cola viven en la memoria del proceso. Con 3 réplicas de Pedidos detrás de un balanceador, ¿qué mostraría /metricas y cuántos reportes simultáneos habría en total? ¿Qué cambiarías?

Con 3 réplicas de Pedidos detrás de un balanceador, `GET /metricas` mostraría solo la memoria del proceso que atendió esa petición: cada réplica tendría su propio `Map`, su propio monitor de bucle y su propio pool, sin una vista global. En total habría hasta **3 × 8 = 24 reportes ejecutándose** y **3 × 16 = 48 en cola**, es decir, 72 aceptados antes de empezar a rechazar, pero cada réplica decidiría sus 503 por separado y el balanceador podría repartir la carga de forma desigual. Cambiaría a **métricas centralizadas** (Prometheus/OpenTelemetry con etiqueta de réplica), una **cola compartida** (Redis/BullMQ, RabbitMQ o Kafka) y un **límite global de concurrencia**; también usaría least-connections o un balanceador consciente de la saturación. Así el estado y la capacidad serían coherentes entre réplicas.

## 3. Problemas encontrados

- La práctica guiada no estaba en el repositorio: faltaban `/reporte/bloqueante`, `/reporte/worker` y `worker-reporte.ts`. Los reconstruí en un PR base antes de empezar las tareas S2.
- autocannon no imprime el desglose de respuestas 2xx cuando no hay non-2xx; el dato de 18 respuestas completadas en el escenario 2 se obtuvo de `/metricas` y de la diferencia entre peticiones enviadas, timeouts y peticiones en vuelo.
- En el escenario 2, las 153 peticiones enviadas no coinciden con las 18 completadas: 86 expiraron y unas 49 seguían en vuelo cuando autocannon cerró las conexiones. Medir con un cliente que corta conexiones hace que el interceptor no vea las respuestas que nunca llegan a terminar.
- `monitorEventLoopDelay` es acumulativo desde el arranque y su resolución de 10 ms hace que el p50 sea ~10 ms incluso en reposo. Para comparar escenarios reinicié Pedidos antes de cada uno, como pedía la tarea.
- El pool crea un worker nuevo por trabajo porque `worker-reporte.ts` se reutiliza tal como está; el costo de arranque del hilo sigue presente y se nota en `bucle.maxMs` y en la latencia de los 2xx.
- Docker en este equipo es Podman con el proveedor `docker-compose`; los comandos `docker compose` funcionaron igual, pero la salida incluye avisos de emulación.

## 4. Uso declarado de IA

Usé IA (OpenCode con modelo DeepSeek) como apoyo para reconstruir la práctica base, escribir el código, ejecutar los escenarios y redactar el análisis. Revisé el código, ejecuté los comandos en mi equipo y verifiqué los datos; las cifras de esta bitácora salen de las salidas de autocannon y de `/metricas` incluidas arriba. La decisión y la responsabilidad de la entrega son mías.
