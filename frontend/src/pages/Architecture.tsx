const FLOW = `  Cliente / stress tool / integraciones
           │  POST /api/events/impression | click | conversion  (JSON)
           ▼
  ┌────────────────┐       ┌──────────────────────────────────────────────┐
  │  nginx api-lb  │       │  API Fastify (Node) — réplicas               │
  │  host :4000    │──────►│  Valida JSON → RabbitMQ → 202 Accepted       │
  └────────────────┘       │  /api/metrics, storage, analytics, stream…   │
                             └─────────────────────┬────────────────────────┘
                                                 │  exchange events (direct)
                                                 ▼
                             ┌──────────────────────────────────────────────┐
                             │  RabbitMQ 3.13                                │
                             │  impressions | clicks | conversions         │
                             │  DLX → *.dlq · reintentos → DLQ             │
                             └─────────────────────┬────────────────────────┘
                                                 │  consume (prefetch)
                                                 ▼
                             ┌──────────────────────────────────────────────┐
                             │  Consumers (Node) — réplicas                 │
                             │  Batch → Influx · putObject MinIO · Redis    │
                             └───┬──────────────────────────┬─────────────────┘
                                 ▼                          ▼
                      ┌──────────────────┐    ┌────────────────────────────┐
                      │ InfluxDB 2.7     │    │ MinIO (API tipo S3)        │
                      │ métricas / Flux  │    │ events/{tipo}/year=…/hour… │
                      └────────┬─────────┘    └─────────────┬──────────────┘
                               │                            │
                               └────────────┬─────────────────┘
                                            ▼
                             ┌──────────────────────────────────────────────┐
                             │  Grafana 10 — datasource Influx              │
                             └──────────────────────────────────────────────┘

  Frontend React (:8080) — SPA; /api/* → proxy al api-lb`;

const COMPONENTS: { name: string; role: string; note: string }[] = [
  { name: 'api-lb (nginx)', role: 'Balanceador hacia réplicas API', note: 'Puerto publicado 4000 en el host.' },
  { name: 'api (Fastify)', role: 'Ingesta REST', note: 'Publica en RabbitMQ; no escribe TSDB en el request caliente.' },
  { name: 'rabbitmq + init', role: 'Cola durable, DLX, políticas', note: 'Lazy queues vía API de gestión al arranque.' },
  { name: 'consumer', role: 'Procesamiento asíncrono', note: 'Influx batch, MinIO particionado; puede usar Redis.' },
  { name: 'redis', role: 'Memoria / coordinación', note: 'Equivalente típico en AWS: ElastiCache.' },
  { name: 'influxdb', role: 'TSDB', note: 'Retención 30d; consultas Grafana y métricas API.' },
  { name: 'minio + init', role: 'Objetos JSON crudos', note: 'Contrato de particiones; migración natural a S3.' },
  { name: 'grafana', role: 'Dashboards', note: 'Provisioning desde el repo.' },
  { name: 'frontend', role: 'UI React', note: 'Nginx sirve estáticos; proxy /api al backend.' },
];

export default function Architecture() {
  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="p-8 max-w-5xl mx-auto space-y-10 pb-24">
        <header className="space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/90 bg-cyan-500/10 border border-cyan-500/25 px-3 py-1 rounded-full inline-block">
            Documentación viva
          </span>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Arquitectura del sistema</h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-3xl">
            <strong className="text-slate-200">Signal Catcher</strong> recibe eventos de publicidad (impresión, click,
            conversión), responde <strong className="text-slate-200">202</strong> enseguida encolando en{' '}
            <strong className="text-slate-200">RabbitMQ</strong>, y los <strong className="text-slate-200">consumers</strong>{' '}
            escriben agregados en <strong className="text-slate-200">InfluxDB</strong> y el JSON crudo en{' '}
            <strong className="text-slate-200">MinIO</strong>. <strong className="text-slate-200">Grafana</strong> consulta
            Influx para paneles y reconciliación bajo carga. Todo corre con{' '}
            <code className="text-indigo-300 text-xs">docker compose up</code>.
          </p>
        </header>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Flujo extremo a extremo</h2>
          <div className="rounded-xl border border-slate-800 bg-[#04080f] p-5 overflow-x-auto">
            <pre className="font-mono text-[10px] sm:text-[11px] leading-relaxed text-slate-400 whitespace-pre">{FLOW}</pre>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Piezas en Docker Compose</h2>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/90 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Servicio</th>
                  <th className="px-4 py-3">Función</th>
                  <th className="px-4 py-3 hidden md:table-cell">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {COMPONENTS.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-semibold text-indigo-200 whitespace-nowrap">{row.name}</td>
                    <td className="px-4 py-3 text-slate-300">{row.role}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-xs font-bold uppercase text-emerald-400/90 mb-2">InfluxDB vs MinIO</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              <strong className="text-slate-200">InfluxDB</strong> guarda series temporales (tags: tipo, estado, anunciante,
              campaña, ad…; campos: conteos, revenue, tiempos) para agregados y dashboards rápidos.
            </p>
            <p className="text-sm text-slate-400 leading-relaxed mt-2">
              <strong className="text-slate-200">MinIO</strong> guarda el payload completo por partición horaria para
              auditoría y reprocesos — no sustituye al TSDB.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-xs font-bold uppercase text-amber-400/90 mb-2">Por qué una cola</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Desacopla la velocidad del cliente (respuesta 202 rápida) de la velocidad de escritura a Influx/S3. Si los
              workers van lentos, <strong className="text-slate-200">RabbitMQ</strong> absorbe picos sin tumbar la API.
            </p>
          </div>
        </div>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Retención (resumen)</h2>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/90 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Retención</th>
                  <th className="px-4 py-3">Racional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-200">InfluxDB</td>
                  <td className="px-4 py-3 text-slate-400">30 días</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">Ventanas de dashboard ≤ 24 h; evita disco sin límite.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-200">MinIO / S3</td>
                  <td className="px-4 py-3 text-slate-400">Política de ciclo de vida</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">Auditoría; en AWS Glacier / Intelligent-Tiering.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-200">DLQ</td>
                  <td className="px-4 py-3 text-slate-400">Hasta revisión</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">Fallos no se pierden en silencio.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-3">Decisiones (defensa oral)</h2>
          <ul className="space-y-2 text-sm text-slate-400 leading-relaxed list-disc pl-5">
            <li>
              <strong className="text-slate-200">RabbitMQ</strong> con exchange direct y cola por tipo; DLX + DLQ. Kafka
              suma operación (particiones, consumer groups) para un patrón “un mensaje, un procesamiento”.
            </li>
            <li>
              <strong className="text-slate-200">InfluxDB</strong> por modelo tag/field y Flux; Timescale implica Postgres +
              migraciones; Prometheus es más pull/métricas de infra.
            </li>
            <li>
              <strong className="text-slate-200">MinIO</strong> en laboratorio por paridad S3 sin credenciales; en nube →
              Amazon S3 con el mismo esquema de particiones.
            </li>
          </ul>
        </section>

        <p className="text-xs text-slate-600 border-t border-slate-800 pt-6">
          Detalle extendido (diagrama + costos AWS en el mismo documento): archivo{' '}
          <code className="text-indigo-400">aws-cost-scenarios.html</code> en la raíz del repo — abrilo con el navegador
          (doble clic o <em>Open with Live Server</em>).
        </p>
      </div>
    </div>
  );
}
