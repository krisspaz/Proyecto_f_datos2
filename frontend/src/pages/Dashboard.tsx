import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, BarController,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  fetchSummary, fetchTimeseries, fetchQueueStatus, fireEvent, resetData,
  type Summary, type TimePoint, type QueueStatus,
} from '../api';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, BarController,
  Tooltip, Legend, Filler,
);

const fmt  = (n: number) => n.toLocaleString('en-US');
const fmtK = (n: number) => n >= 1_000_000 ? (n/1_000_000).toFixed(2)+'M' : n >= 1_000 ? (n/1_000).toFixed(1)+'k' : String(n);

const EMPTY: Summary = { impressions: 0, clicks: 0, conversions: 0, ctr: '0.00' };

/* ── KPI card ───────────────────────────────────────────── */
function KpiCard({
  label, value, sub, accent, glow, dotColor, icon, badge,
}: {
  label: string; value: string; sub?: string;
  accent: string; glow: string; dotColor?: string; icon: string; badge?: string;
}) {
  return (
    <div className={`relative rounded-2xl p-6 overflow-hidden border ${accent} group transition-all duration-300 hover:scale-[1.01]`}
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
      {/* glow blob */}
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20 blur-2xl ${glow}`} />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">{label}</span>
          <div className="flex items-center gap-2">
            {badge && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {badge}
              </span>
            )}
            {dotColor && <span className={`h-1.5 w-1.5 rounded-full ${dotColor} animate-pulse`} />}
            <span className="material-symbols-outlined text-lg text-slate-700 group-hover:text-slate-500 transition-colors">{icon}</span>
          </div>
        </div>

        <p className="text-5xl font-black text-white tracking-tight leading-none tabular-nums">{value}</p>

        {sub && <p className="text-[11px] text-slate-500 mt-2.5 font-medium">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Live badge ─────────────────────────────────────────── */
function LiveBadge({ stale }: { stale: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${stale ? 'text-amber-400' : 'text-emerald-400'}`}>
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${stale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      </span>
      {stale ? 'Stale' : 'Live'}
    </span>
  );
}

/* ── Dashboard ──────────────────────────────────────────── */
export default function Dashboard() {
  const [summary, setSummary]       = useState<Summary>(EMPTY);
  const [ts, setTs]                 = useState<TimePoint[]>([]);
  const [queues, setQueues]         = useState<QueueStatus[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isFiring, setIsFiring]     = useState(false);
  const [resetting, setResetting]   = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Keep last good timeseries so chart never goes blank on a failed poll
  const lastGoodTs = useRef<TimePoint[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 12_000);

    try {
      const [s, t, q] = await Promise.all([
        fetchSummary().catch(() => null),
        fetchTimeseries('1m', '1h').catch(() => null),
        fetchQueueStatus().catch(() => [] as QueueStatus[]),
      ]);

      if (s) setSummary(s);

      if (t && t.length > 0) {
        lastGoodTs.current = t;
        setTs(t);
        setFetchError(false);
      } else if (t !== null) {
        // returned empty array — clear chart
        lastGoodTs.current = [];
        setTs([]);
        setFetchError(false);
      } else {
        // fetch failed — keep last good data
        if (lastGoodTs.current.length > 0) setTs(lastGoodTs.current);
        setFetchError(true);
      }

      setQueues(q);
      setLastUpdate(new Date());
    } finally {
      clearTimeout(tid);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  /* ── Fire events ──────────────────────────────────────── */
  const handleFireEvents = async () => {
    setIsFiring(true);
    try {
      const states = ['CA','TX','NY','FL','WA','IL','PA','OH','GA','NC'];
      const advs   = ['adv-101','adv-202','adv-303','adv-404','adv-505'];
      const batch: Promise<Response>[] = [];

      for (let i = 0; i < 50; i++) {
        const state = states[Math.floor(Math.random() * states.length)];
        const adv   = advs[Math.floor(Math.random() * advs.length)];
        const impId  = `imp-${Date.now()}-${i}`;
        const clickId = `clk-${Date.now()}-${i}`;

        batch.push(fireEvent('impression', {
          impression_id: impId,
          user_ip: `10.${(Math.random()*255)|0}.${(Math.random()*255)|0}.1`,
          user_agent: 'Mozilla/5.0 Dashboard-Test',
          timestamp: new Date().toISOString(),
          state, search_keywords: 'test', session_id: `sess-${Date.now()}-${i}`,
          ads: [{ advertiser: { advertiser_id: adv, advertiser_name: 'Test Co.' },
            campaign: { campaign_id: 'camp-1', campaign_name: 'Test' },
            ad: { ad_id: 'ad-1', ad_name: 'Test', ad_text: 'Click me', ad_link: 'https://example.com', ad_position: 1, ad_format: 'banner' } }],
        }));

        if (Math.random() < 0.4) batch.push(fireEvent('click', {
          click_id: clickId, impression_id: impId,
          timestamp: new Date().toISOString(),
          clicked_ad: { ad_id: 'ad-1', ad_position: 1,
            click_coordinates: { x: 100, y: 200, normalized_x: 0.5, normalized_y: 0.5 },
            time_to_click: +(Math.random()*30).toFixed(2) },
          user_info: { user_ip: '10.0.0.1', state, session_id: `sess-${Date.now()}-${i}` },
        }));

        if (Math.random() < 0.15) batch.push(fireEvent('conversion', {
          conversion_id: `conv-${Date.now()}-${i}`, click_id: clickId, impression_id: impId,
          timestamp: new Date().toISOString(), conversion_type: 'purchase',
          conversion_value: +(Math.random()*200+10).toFixed(2), conversion_currency: 'USD',
          conversion_attributes: {},
          attribution_info: { time_to_convert: Math.floor(Math.random()*900), attribution_model: 'last_click' },
          user_info: { user_ip: '10.0.0.1', state, session_id: `sess-${Date.now()}-${i}` },
        }));
      }

      await Promise.all(batch);
      setTimeout(load, 2500);
    } finally {
      setIsFiring(false);
    }
  };

  /* ── Reset ────────────────────────────────────────────── */
  const handleReset = async () => {
    if (!window.confirm('¿Borrar todos los datos?')) return;
    setResetting(true);
    // Stop polling so stale data doesn't repopulate
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      await resetData();
    } finally {
      // Zero out UI immediately — polling will reconcile once InfluxDB finishes the delete
      setSummary(EMPTY);
      setTs([]);
      setFetchError(false);
      lastGoodTs.current = [];
      setResetting(false);
      // Restart polling with a short initial delay so InfluxDB has time to finish deleting
      setTimeout(() => {
        timerRef.current = setInterval(load, 5000);
        load();
      }, 3000);
    }
  };

  /* ── Derived stats ────────────────────────────────────── */
  const ctr = summary.impressions > 0
    ? ((summary.clicks / summary.impressions) * 100).toFixed(2)
    : '0.00';

  const convRate = summary.clicks > 0
    ? ((summary.conversions / summary.clicks) * 100).toFixed(2)
    : '0.00';

  // Events per minute from last timeseries point
  const lastPoint = ts[ts.length - 1];
  const eventsPerMin = lastPoint
    ? ((lastPoint.impressions ?? 0) + (lastPoint.clicks ?? 0) + (lastPoint.conversions ?? 0))
    : 0;

  const allQueuesHealthy = queues.length > 0 &&
    queues.filter(q => q.name.endsWith('.dlq')).every(q => q.messages === 0);

  const isStale = fetchError;

  /* ── Chart ────────────────────────────────────────────── */
  const hasData = ts.some(p => (p.impressions ?? 0) + (p.clicks ?? 0) + (p.conversions ?? 0) > 0);

  const labels = ts.map(p =>
    new Date(p.time).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false })
  );

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Impressions',
        data: ts.map(p => p.impressions ?? 0),
        borderColor: '#818cf8',
        backgroundColor: (ctx: { chart: ChartJS }) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, 'rgba(129,140,248,0.3)');
          g.addColorStop(1, 'rgba(129,140,248,0)');
          return g;
        },
        tension: 0.35, fill: true, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: '#818cf8', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        borderWidth: 2.5,
      },
      {
        label: 'Clicks',
        data: ts.map(p => p.clicks ?? 0),
        borderColor: '#f59e0b',
        backgroundColor: (ctx: { chart: ChartJS }) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, 'rgba(245,158,11,0.18)');
          g.addColorStop(1, 'rgba(245,158,11,0)');
          return g;
        },
        tension: 0.35, fill: true, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: '#f59e0b', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        borderWidth: 2,
      },
      {
        label: 'Conversions',
        data: ts.map(p => p.conversions ?? 0),
        borderColor: '#10b981',
        backgroundColor: (ctx: { chart: ChartJS }) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, 'rgba(16,185,129,0.15)');
          g.addColorStop(1, 'rgba(16,185,129,0)');
          return g;
        },
        tension: 0.35, fill: true, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: '#10b981', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#64748b', boxWidth: 24, boxHeight: 2,
          useBorderRadius: true, borderRadius: 1,
          font: { size: 11, weight: 'bold' as const }, padding: 24,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(2,6,23,0.97)',
        borderColor: 'rgba(51,65,85,0.8)', borderWidth: 1,
        titleColor: '#f1f5f9', titleFont: { size: 12, weight: 'bold' as const },
        bodyColor: '#94a3b8', bodyFont: { size: 11 },
        padding: { top: 12, bottom: 12, left: 16, right: 16 },
        cornerRadius: 10, displayColors: true,
        boxWidth: 10, boxHeight: 10, boxPadding: 5, usePointStyle: true,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y ?? 0)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#334155', font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 },
        grid: { color: 'rgba(15,23,42,0.8)', lineWidth: 1 },
        border: { display: false },
      },
      y: {
        position: 'left' as const,
        ticks: {
          color: '#334155', font: { size: 10 }, maxTicksLimit: 6,
          callback: (v: number | string) => fmtK(Number(v)),
        },
        grid: { color: 'rgba(30,41,59,0.6)', lineWidth: 1 },
        border: { display: false },
        beginAtZero: true,
      },
    },
  };

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4 p-5" style={{ height: '100vh' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-black text-white tracking-tight">Live Dashboard</h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {lastUpdate
              ? `Actualizado ${lastUpdate.toLocaleTimeString('es-GT', { hour12: false })} · cada 5s`
              : 'Conectando...'}
            {fetchError && <span className="text-amber-500 ml-2">· chart usando datos anteriores</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {eventsPerMin > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-sm text-indigo-400">speed</span>
              <span className="text-xs font-bold text-slate-300">{fmt(eventsPerMin)}</span>
              <span className="text-[10px] text-slate-600">ev/min</span>
            </div>
          )}
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/40 text-slate-500 hover:text-rose-400 text-xs font-bold rounded-lg transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            {resetting ? 'Resetting...' : 'Reset'}
          </button>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider ${
            allQueuesHealthy
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
              : queues.length === 0
              ? 'bg-slate-900 border-slate-800 text-slate-600'
              : 'bg-amber-500/5 border-amber-500/20 text-amber-400'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${allQueuesHealthy ? 'bg-emerald-400 animate-pulse' : queues.length === 0 ? 'bg-slate-600' : 'bg-amber-400'}`} />
            {allQueuesHealthy ? 'Pipeline OK' : queues.length === 0 ? 'Connecting' : 'Warning'}
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-3 gap-4 flex-shrink-0">
        <KpiCard
          label="Impressions"
          value={fmt(summary.impressions)}
          sub={`CTR ${ctr}%  ·  last 24h`}
          accent="border-indigo-500/20"
          glow="bg-indigo-500"
          icon="visibility"
          dotColor={summary.impressions > 0 ? 'bg-indigo-400' : undefined}
        />
        <KpiCard
          label="Clicks"
          value={fmt(summary.clicks)}
          sub={`Conv rate ${convRate}%  ·  last 24h`}
          accent="border-amber-500/20"
          glow="bg-amber-500"
          icon="ads_click"
          dotColor={summary.clicks > 0 ? 'bg-amber-400' : undefined}
        />
        <KpiCard
          label="Conversions"
          value={fmt(summary.conversions)}
          sub={`Total: ${fmtK(summary.impressions + summary.clicks + summary.conversions)} events  ·  last 24h`}
          accent="border-emerald-500/20"
          glow="bg-emerald-500"
          icon="shopping_cart"
          dotColor={summary.conversions > 0 ? 'bg-emerald-400' : undefined}
        />
      </div>

      {/* ── Chart ── */}
      <div className="flex-1 min-h-0 rounded-2xl border border-slate-800 overflow-hidden flex flex-col"
        style={{ background: 'linear-gradient(180deg, #0d1525 0%, #0a0f1e 100%)' }}>

        {/* accent line */}
        <div className="h-px flex-shrink-0 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/* chart header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-200">Event Volume</span>
              <span className="text-[10px] text-slate-600 ml-2">última hora · ventanas de 1 min</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleFireEvents}
              disabled={isFiring}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all ${
                isFiring
                  ? 'bg-slate-800/50 text-slate-600 border-slate-800 cursor-wait'
                  : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25 hover:bg-indigo-500/20 hover:border-indigo-400/50 active:scale-95'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                {isFiring ? 'hourglass_empty' : 'bolt'}
              </span>
              {isFiring ? 'Sending...' : 'Fire Events'}
            </button>
            <LiveBadge stale={isStale} />
          </div>
        </div>

        {/* chart area */}
        <div className="flex-1 min-h-0 px-4 pb-4">
          {hasData ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div className="h-full relative flex flex-col items-center justify-center gap-3">
              <svg viewBox="0 0 900 220" className="absolute inset-0 w-full h-full opacity-[0.06]" preserveAspectRatio="none">
                {[44,88,132,176].map(y => <line key={y} x1="0" y1={y} x2="900" y2={y} stroke="#475569" strokeWidth="0.8"/>)}
                {[112,225,337,450,562,675,787].map(x => <line key={x} x1={x} y1="0" x2={x} y2="220" stroke="#475569" strokeWidth="0.8"/>)}
                <polyline fill="none" stroke="#818cf8" strokeWidth="2.5"
                  points="0,180 90,155 180,110 270,80 360,95 450,55 540,45 630,65 720,50 810,35 900,55"/>
                <polyline fill="none" stroke="#f59e0b" strokeWidth="2"
                  points="0,200 90,188 180,172 270,160 360,163 450,145 540,133 630,148 720,138 810,122 900,135"/>
                <polyline fill="none" stroke="#10b981" strokeWidth="1.5"
                  points="0,215 90,212 180,208 270,203 360,205 450,198 540,193 630,199 720,194 810,186 900,190"/>
              </svg>
              <div className="relative z-10 text-center">
                <p className="text-sm font-semibold text-slate-500">Sin datos en la última hora</p>
                <p className="text-xs text-slate-700 mt-1">
                  Usa{' '}
                  <button onClick={handleFireEvents} disabled={isFiring}
                    className="text-indigo-500 hover:text-indigo-400 underline underline-offset-2">
                    Fire Events
                  </button>
                  {' '}o corre el stress test
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
