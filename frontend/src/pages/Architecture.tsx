const FLOW = `Cliente / stress tool
  |
  | POST /api/events/impression | click | conversion
  v
+----------------+        +-----------------------------------------+
| nginx api-lb   | -----> | API Fastify replicas                    |
| host :4000     |        | valida JSON, publica en RabbitMQ, 202   |
+----------------+        +--------------------+--------------------+
                                           |
                                           | direct exchange: events
                                           v
                         +-----------------------------------------+
                         | RabbitMQ 3.13                           |
                         | queues: impressions, clicks, conversions|
                         | DLX: events.dlx -> *.dlq                |
                         | retry: 1s, 2s, 4s, luego DLQ            |
                         +--------------------+--------------------+
                                           |
                                           | consume con prefetch
                                           v
                         +-----------------------------------------+
                         | Consumer replicas                       |
                         | batch raw JSON a MinIO                  |
                         | batch metrics a InfluxDB                |
                         | Redis para atribucion cross-replica     |
                         +--------------+-------------+------------+
                                        |             |
                                        v             v
                         +-------------------+   +---------------------------+
                         | InfluxDB 2.7      |   | MinIO, API tipo S3        |
                         | events, events_agg|   | events/{tipo}/year=...   |
                         +---------+---------+   +-------------+-------------+
                                   |                           |
                                   +-------------+-------------+
                                                 v
                         +-----------------------------------------+
                         | Grafana y frontend React                |
                         | paneles, storage, queues, analytics     |
                         +-----------------------------------------+`;

const COMPONENTS: { name: string; role: string; note: string }[] = [
  { name: 'api-lb', role: 'Balancea trafico a las replicas API', note: 'Expone el puerto 4000 al host.' },
  { name: 'api', role: 'Ingesta REST', note: 'Valida payloads y responde 202 despues de bufferizar hacia RabbitMQ.' },
  { name: 'rabbitmq', role: 'Colas durables por tipo de evento', note: 'DLX y DLQ para mensajes fallidos.' },
  { name: 'consumer', role: 'Procesamiento asincrono', note: 'Guarda raw JSON en MinIO y metricas en InfluxDB.' },
  { name: 'redis', role: 'Cache de atribucion', note: 'Relaciona impression_id con advertiser_id entre replicas.' },
  { name: 'influxdb', role: 'Base de series temporales', note: 'Retencion 30 dias, consultas Flux para dashboard.' },
  { name: 'minio', role: 'Object storage compatible con S3', note: 'Particiones por tipo, fecha y hora.' },
  { name: 'grafana', role: 'Dashboard de verificacion', note: 'Provisionado desde el repo, refresco menor a 60s.' },
  { name: 'frontend', role: 'Interfaz operativa React', note: 'Muestra metricas, colas, storage, costos y arquitectura.' },
];

export default function Architecture() {
  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="p-8 max-w-5xl mx-auto space-y-10 pb-24">
        <header className="space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/90 bg-cyan-500/10 border border-cyan-500/25 px-3 py-1 rounded-full inline-block">
            Documentacion viva
          </span>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Arquitectura del sistema</h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-3xl">
            Signal Catcher recibe eventos de publicidad, responde 202 rapido, procesa por colas y expone metricas
            reconciliables en Grafana. La ruta critica del request no escribe directamente en la TSDB ni en object storage.
          </p>
        </header>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Flujo extremo a extremo</h2>
          <div className="rounded-lg border border-slate-800 bg-[#04080f] p-5 overflow-x-auto">
            <pre className="font-mono text-[10px] sm:text-[11px] leading-relaxed text-slate-400 whitespace-pre">{FLOW}</pre>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Servicios</h2>
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/90 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Servicio</th>
                  <th className="px-4 py-3">Funcion</th>
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

        <section className="grid md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-xs font-bold uppercase text-emerald-400/90 mb-2">Ingesta</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              La API valida el JSON, lo coloca en un buffer por cola y responde 202. RabbitMQ persiste los mensajes.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-xs font-bold uppercase text-amber-400/90 mb-2">Procesamiento</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Los consumers guardan primero el lote raw en MinIO, escriben metricas en InfluxDB y luego hacen ack.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-xs font-bold uppercase text-indigo-400/90 mb-2">Consulta</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Grafana y el frontend consultan InfluxDB para conteos, tasas, promedios y tops. Storage lee particiones MinIO.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Puntos para defender</h2>
          <ul className="space-y-2 text-sm text-slate-400 leading-relaxed list-disc pl-5">
            <li>RabbitMQ encaja con el patron de un procesamiento por evento y simplifica DLQ/retry frente a Kafka.</li>
            <li>InfluxDB es adecuado para ventanas de tiempo y agregaciones por tags sin migraciones relacionales.</li>
            <li>MinIO replica el contrato S3 en local y permite migrar a AWS S3 manteniendo el prefijo particionado.</li>
            <li>Redis permite atribuir conversions a advertisers aunque impressions y conversions caigan en replicas distintas.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
