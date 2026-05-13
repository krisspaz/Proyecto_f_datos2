import { useState } from 'react';
import { Link } from 'react-router-dom';

type ScenarioId = 'low' | 'med' | 'high';

interface Scenario {
  id: ScenarioId;
  short: string;
  title: string;
  rps: number;
  eventsLabel: string;
  totalOnDemand: number;
  totalReserved1y: number;
  pitch: string;
  lines: { category: string; detail: string; usd: number }[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 'low',
    short: '100 rps',
    title: 'Pilotaje / staging',
    rps: 100,
    eventsLabel: '~259 M eventos/mes',
    totalOnDemand: 188,
    totalReserved1y: 148,
    pitch:
      'Ideal para validar el pipeline con el stress test Tier 1, demos internas o un primer cliente. RabbitMQ auto-gestionado en EC2 para evitar el costo fijo de Amazon MQ.',
    lines: [
      { category: 'Compute (ECS Fargate)', detail: 'API 1×0.5 vCPU + Consumer 1×0.5 vCPU', usd: 36 },
      { category: 'Cola de mensajes', detail: 'RabbitMQ en EC2 t3.medium + EBS 20 GB', usd: 32 },
      { category: 'InfluxDB + Grafana', detail: 'EC2 t3.large + EBS 100 GB (colocados)', usd: 69 },
      { category: 'Amazon S3', detail: '~130 GB Standard, archivos por hora', usd: 3 },
      { category: 'Red', detail: 'ALB + NAT Gateway (ajustable con VPC endpoints)', usd: 45 },
      { category: 'Observabilidad', detail: 'CloudWatch Logs ~5 GB/mes', usd: 3 },
    ],
  },
  {
    id: 'med',
    short: '500 rps',
    title: 'Producción moderada',
    rps: 500,
    eventsLabel: '~1,3 B eventos/mes',
    totalOnDemand: 508,
    totalReserved1y: 390,
    pitch:
      'Producción regional o SaaS en crecimiento: réplicas de API y consumer, Amazon MQ administrado para SLA operativo, Influx en m5.large.',
    lines: [
      { category: 'Compute (ECS Fargate)', detail: 'API 2×1 vCPU + Consumer 2×0.5 vCPU', usd: 108 },
      { category: 'Cola de mensajes', detail: 'Amazon MQ RabbitMQ mq.m5.large', usd: 210 },
      { category: 'InfluxDB', detail: 'EC2 m5.large + EBS gp3 300 GB', usd: 94 },
      { category: 'Amazon S3', detail: '~648 GB Standard', usd: 15 },
      { category: 'Red', detail: 'ALB + NAT (~5 LCU)', usd: 68 },
      { category: 'Observabilidad', detail: 'CloudWatch Logs ~25 GB/mes', usd: 13 },
    ],
  },
  {
    id: 'high',
    short: '1.000 rps',
    title: 'Enterprise / Tier 3',
    rps: 1000,
    eventsLabel: '~2,6 B eventos/mes',
    totalOnDemand: 768,
    totalReserved1y: 595,
    pitch:
      'Diseño alineado con el load test Tier 3 del curso: API y consumer en Fargate con más vCPU, broker administrado, Influx m5.xlarge y S3 dimensionado para retención de 30 días.',
    lines: [
      { category: 'Compute (ECS Fargate)', detail: 'API 2×2 vCPU + Consumer 2×1 vCPU', usd: 216 },
      { category: 'Cola de mensajes', detail: 'Amazon MQ RabbitMQ mq.m5.large', usd: 210 },
      { category: 'InfluxDB', detail: 'EC2 m5.xlarge + EBS gp3 500 GB', usd: 180 },
      { category: 'Amazon S3', detail: '~1,3 TB Standard', usd: 30 },
      { category: 'Red', detail: 'ALB + NAT (tráfico alto)', usd: 107 },
      { category: 'Observabilidad', detail: 'CloudWatch Logs ~50 GB/mes', usd: 25 },
    ],
  },
];

const STACK_ROWS: {
  local: string;
  role: string;
  aws: string;
  low: number | null;
  med: number | null;
  high: number | null;
}[] = [
  {
    local: 'RabbitMQ + init',
    role: 'Colas durable, DLX, políticas',
    aws: 'EC2 self-managed (baja) → Amazon MQ mq.m5.large (media/alta)',
    low: 32,
    med: 210,
    high: 210,
  },
  {
    local: 'InfluxDB 2.7',
    role: 'TSDB, métricas agregadas',
    aws: 'EC2 + EBS (t3.large → m5.large → m5.xlarge)',
    low: 69,
    med: 94,
    high: 180,
  },
  {
    local: 'MinIO',
    role: 'JSON crudo particionado',
    aws: 'Amazon S3 Standard',
    low: 3,
    med: 15,
    high: 30,
  },
  {
    local: 'Grafana',
    role: 'Dashboards provisionados',
    aws: 'Colocado con Influx (baja/media) o sin línea extra en modelo alto',
    low: 0,
    med: 0,
    high: 0,
  },
  {
    local: 'API + nginx LB + Consumer + Frontend',
    role: 'Ingesta REST, workers, UI estática',
    aws: 'ECS Fargate + ALB + S3/CloudFront',
    low: 36,
    med: 108,
    high: 216,
  },
  {
    local: 'Red + logs',
    role: 'NAT, LCU, CloudWatch',
    aws: 'VPC, ALB, CloudWatch Logs',
    low: 48,
    med: 81,
    high: 132,
  },
];

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CloudCosts() {
  const [scenario, setScenario] = useState<ScenarioId>('high');
  const sc = SCENARIOS.find((s) => s.id === scenario)!;

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="p-8 max-w-5xl mx-auto space-y-10 pb-24">
        {/* Hero */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/90 bg-amber-500/10 border border-amber-500/25 px-3 py-1 rounded-full">
              Propuesta comercial
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Región us-east-1 · On-demand · Estimación mayo 2026
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
            ¿Cuánto costaría llevar Signal Catcher a AWS?
          </h1>
          <p className="text-sm">
            <Link to="/architecture" className="text-indigo-400 hover:text-indigo-300 font-semibold underline-offset-2 hover:underline">
              Ver arquitectura del sistema (flujo y componentes)
            </Link>
          </p>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-3xl">
            Hoy el sistema corre en <strong className="text-slate-300">Docker Compose</strong> en sus servidores o en
            laboratorio (costo de cómpute propio). La tabla siguiente traduce el mismo stack a{' '}
            <strong className="text-slate-300">servicios AWS equivalentes</strong>, con cifras mensuales para
            presentar a dirección o a un cliente — no es una cotización oficial de AWS; sirve como orden de magnitud
            para un <em>pitch</em> o un ejercicio de costos del curso.
          </p>
        </header>

        {/* Scenario pills */}
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScenario(s.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                scenario === s.id
                  ? s.id === 'low'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : s.id === 'med'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {s.short} — {s.title}
            </button>
          ))}
        </div>

        {/* Big numbers */}
        <section className="grid md:grid-cols-2 gap-6">
          <div
            className={`rounded-2xl border p-8 ${
              scenario === 'low'
                ? 'border-emerald-500/30 bg-emerald-950/20'
                : scenario === 'med'
                  ? 'border-amber-500/30 bg-amber-950/20'
                  : 'border-rose-500/30 bg-rose-950/20'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Inversión mensual estimada (on-demand)
            </p>
            <p className="text-5xl md:text-6xl font-black text-white tracking-tight">
              {money(sc.totalOnDemand)}
            </p>
            <p className="text-sm text-slate-400 mt-3">
              Carga sostenida <strong className="text-slate-200">{sc.rps.toLocaleString()} rps</strong> ·{' '}
              {sc.eventsLabel}
            </p>
            <p className="text-xs text-slate-500 mt-4 leading-relaxed">{sc.pitch}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">
              Con compromiso 1 año (Reserved / Savings Plan)
            </p>
            <p className="text-4xl font-black text-indigo-200">{money(sc.totalReserved1y)}</p>
            <p className="text-sm text-slate-500 mt-3">
              Ahorro orientativo vs on-demand (~22% compute, RI en EC2, etc.), según el mismo modelo que el documento
              HTML de escenarios del repo.
            </p>
            <ul className="mt-6 space-y-2 text-xs text-slate-400">
              <li className="flex gap-2">
                <span className="text-emerald-500 font-bold">✓</span>
                Incluye cola, TSDB, objeto, API, consumers y observabilidad base.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500 font-bold">✓</span>
                No incluye soporte enterprise, WAF avanzado ni multi-región.
              </li>
            </ul>
          </div>
        </section>

        {/* Breakdown */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
            Desglose — {sc.short}
          </h2>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/80 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Configuración típica</th>
                  <th className="px-4 py-3 text-right w-28">USD/mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {sc.lines.map((row) => (
                  <tr key={row.category} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-semibold text-slate-200">{row.category}</td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{row.detail}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-white">{money(row.usd)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-950 border-t-2 border-slate-800">
                  <td colSpan={2} className="px-4 py-4 font-black text-white uppercase text-xs tracking-wide">
                    Total estimado
                  </td>
                  <td className="px-4 py-4 text-right font-black text-lg text-emerald-400">{money(sc.totalOnDemand)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Stack mapping */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
            Stack del repo → equivalente AWS (comparativa por escenario)
          </h2>
          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-slate-900/80 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">En docker-compose</th>
                  <th className="px-4 py-3 hidden md:table-cell">Rol</th>
                  <th className="px-4 py-3 hidden lg:table-cell">En AWS</th>
                  <th className="px-4 py-3 text-right text-emerald-500/90">100 rps</th>
                  <th className="px-4 py-3 text-right text-amber-500/90">500 rps</th>
                  <th className="px-4 py-3 text-right text-rose-400/90">1k rps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {STACK_ROWS.map((row) => (
                  <tr key={row.local} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-medium text-slate-200">{row.local}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell max-w-[140px]">{row.role}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell max-w-[220px]">{row.aws}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {row.low !== null ? money(row.low) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {row.med !== null ? money(row.med) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200 font-bold">
                      {row.high !== null ? money(row.high) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">
            Las filas de “Red + logs” agrupan ALB, NAT y CloudWatch para la vista corta; el desglose detallado coincide
            con <code className="text-indigo-400">aws-cost-scenarios.html</code> del repositorio. En Docker tenés 3
            réplicas de consumer; el costeo “alta” del HTML usa 2 tasks de consumer — ajustar réplicas cambia Fargate
            de forma lineal.
          </p>
        </section>

        {/* Executive bullets */}
        <section className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-8">
          <h2 className="text-sm font-black text-indigo-200 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-xl">corporate_fare</span>
            Mensaje para dirección o cliente
          </h2>
          <ul className="space-y-3 text-sm text-slate-400 leading-relaxed">
            <li>
              <strong className="text-slate-200">Pipeline probado:</strong> misma arquitectura que en clase (API →
              RabbitMQ → consumers → InfluxDB + S3/MinIO → Grafana), lista para escalar réplicas en ECS.
            </li>
            <li>
              <strong className="text-slate-200">Rango de inversión:</strong> entre {money(188)} y{' '}
              {money(768)} mensuales en AWS on-demand según tráfico sostenido (100–1.000 rps), antes de optimizaciones
              de compra ({money(148)}–{money(595)} con compromisos de 1 año).
            </li>
            <li>
              <strong className="text-slate-200">Próximo paso:</strong> fijar SLA, retención de datos y región; pedir
              cotización formal con AWS Calculator o partner — estas cifras son orden de magnitud para decisiones
              internas.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
