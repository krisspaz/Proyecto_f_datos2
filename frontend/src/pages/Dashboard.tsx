import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  fetchSummary, fetchTimeseries, fetchQueueStatus, fireEvent, resetData,
  type Summary, type TimePoint, type QueueStatus,
} from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const fmt = (n: number) => n.toLocaleString('en-US');

const EMPTY: Summary = { impressions: 0, clicks: 0, conversions: 0, ctr: '0.00' };

/* ─── KPI card ─── */
interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  dotColor?: string;
  icon: string;
}

function KpiCard({ label, value, sub, accent, dotColor, icon }: KpiProps) {
  return (
    <div className={`relative bg-slate-900 border rounded-xl p-5 overflow-hidden ${accent} group hover:border-opacity-60 transition-all duration-300`}>
      <div className="absolute inset-0 opacity-[0.03] bg-gradient-to-br from-white to-transparent pointer-events-none" />
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <div className="flex items-center gap-1.5">
          {dotColor && <span className={`h-1.5 w-1.5 rounded-full ${dotColor} animate-pulse`} />}
          <span className="material-symbols-outlined text-base text-slate-600 group-hover:text-slate-400 transition-colors">{icon}</span>
        </div>
      </div>
      <p className="text-3xl font-black text-white tracking-tight leading-none">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1.5">{sub}</p>}
    </div>
  );
}

/* ─── Live pulse ─── */
function LivePulse({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [summary, setSummary]       = useState<Summary>(EMPTY);
  const [ts, setTs]                 = useState<TimePoint[]>([]);
  const [queues, setQueues]         = useState<QueueStatus[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isFiring, setIsFiring]     = useState(false);
  const [resetting, setResetting]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [s, t, q] = await Promise.all([
      fetchSummary().catch(() => null),
      fetchTimeseries('1m', '2h').catch(() => [] as TimePoint[]),
      fetchQueueStatus().catch(() => [] as QueueStatus[]),
    ]);
    if (s) setSummary(s);
    setTs(t);
    setQueues(q);
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const handleFireEvents = async () => {
    setIsFiring(true);
    try {
      const states = ['CA', 'TX', 'NY', 'FL', 'WA', 'IL', 'PA', 'OH', 'GA', 'NC'];
      const advertisers = ['adv-101', 'adv-202', 'adv-303'];
      const batch: Promise<Response>[] = [];

      for (let i = 0; i < 30; i++) {
        const state = states[Math.floor(Math.random() * states.length)];
        const adv = advertisers[Math.floor(Math.random() * advertisers.length)];
        const impId = `imp-${Date.now()}-${i}`;
        const clickId = `clk-${Date.now()}-${i}`;

        batch.push(fireEvent('impression', {
          impression_id: impId,
          user_ip: `10.${(Math.random()*255)|0}.${(Math.random()*255)|0}.${(Math.random()*255)|0}`,
          user_agent: 'Mozilla/5.0 Dashboard-Test',
          timestamp: new Date().toISOString(),
          state,
          search_keywords: 'test',
          session_id: `sess-${Date.now()}-${i}`,
          ads: [{ advertiser: { advertiser_id: adv, advertiser_name: 'Test' }, campaign: { campaign_id: 'camp-1', campaign_name: 'Test' }, ad: { ad_id: 'ad-1', ad_name: 'Test Ad', ad_text: 'Test', ad_link: 'https://example.com', ad_position: 1, ad_format: 'banner' } }],
        }));

        if (Math.random() < 0.4) {
          batch.push(fireEvent('click', {
            click_id: clickId,
            impression_id: impId,
            timestamp: new Date().toISOString(),
            clicked_ad: { ad_id: 'ad-1', ad_position: 1, click_coordinates: { x: 100, y: 200, normalized_x: 0.5, normalized_y: 0.5 }, time_to_click: +(Math.random() * 30).toFixed(2) },
            user_info: { user_ip: '10.0.0.1', state, session_id: `sess-${Date.now()}-${i}` },
          }));
        }

        if (Math.random() < 0.15) {
          batch.push(fireEvent('conversion', {
            conversion_id: `conv-${Date.now()}-${i}`,
            click_id: clickId,
            impression_id: impId,
            timestamp: new Date().toISOString(),
            conversion_type: 'purchase',
            conversion_value: +(Math.random() * 200 + 10).toFixed(2),
            conversion_currency: 'USD',
            conversion_attributes: {},
            attribution_info: { time_to_convert: Math.floor(Math.random() * 900), attribution_model: 'last_click' },
            user_info: { user_ip: '10.0.0.1', state, session_id: `sess-${Date.now()}-${i}` },
          }));
        }
      }

      await Promise.all(batch);
      setTimeout(load, 2500);
    } finally {
      setIsFiring(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('¿Borrar todos los datos? Esta acción no se puede deshacer.')) return;
    setResetting(true);
    try {
      await resetData();
      setSummary(EMPTY);
      setTs([]);
      await load();
    } finally {
      setResetting(false);
    }
  };

  /* ─── Chart config ─── */
  const chartData = {
    labels: ts.map((p) =>
      new Date(p.time).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false })
    ),
    datasets: [
      {
        label: 'Impressions',
        data: ts.map((p) => p.impressions ?? 0),
        borderColor: '#818cf8',
        backgroundColor: (ctx: { chart: ChartJS }) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, 'rgba(129,140,248,0.25)');
          g.addColorStop(0.6, 'rgba(129,140,248,0.06)');
          g.addColorStop(1, 'rgba(129,140,248,0)');
          return g;
        },
        tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: '#818cf8', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        borderWidth: 2.5,
      },
      {
        label: 'Clicks',
        data: ts.map((p) => p.clicks ?? 0),
        borderColor: '#fbbf24',
        backgroundColor: (ctx: { chart: ChartJS }) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, 'rgba(251,191,36,0.15)');
          g.addColorStop(0.6, 'rgba(251,191,36,0.03)');
          g.addColorStop(1, 'rgba(251,191,36,0)');
          return g;
        },
        tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: '#fbbf24', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        borderWidth: 2,
      },
      {
        label: 'Conversions',
        data: ts.map((p) => p.conversions ?? 0),
        borderColor: '#34d399',
        backgroundColor: (ctx: { chart: ChartJS }) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, 'rgba(52,211,153,0.12)');
          g.addColorStop(0.6, 'rgba(52,211,153,0.03)');
          g.addColorStop(1, 'rgba(52,211,153,0)');
          return g;
        },
        tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: '#34d399', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400, easing: 'easeOutQuart' as const },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#94a3b8', boxWidth: 12, boxHeight: 3,
          useBorderRadius: true, borderRadius: 2,
          font: { size: 11, weight: 'bold' as const }, padding: 20,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(51,65,85,0.6)', borderWidth: 1,
        titleColor: '#e2e8f0', titleFont: { size: 12, weight: 'bold' as const },
        bodyColor: '#94a3b8', bodyFont: { size: 11 },
        padding: { top: 10, bottom: 10, left: 14, right: 14 },
        cornerRadius: 8, displayColors: true,
        boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            ` ${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toLocaleString('en-US')}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 12, maxRotation: 0 },
        grid: { color: 'rgba(30,41,59,0.5)', lineWidth: 0.5 },
        border: { display: false },
      },
      y: {
        ticks: { color: '#475569', font: { size: 10 }, callback: (v: number | string) => fmt(Number(v)), maxTicksLimit: 6 },
        grid: { color: 'rgba(30,41,59,0.5)', lineWidth: 0.5 },
        border: { display: false },
        beginAtZero: true,
      },
    },
  };

  const allQueuesHealthy = queues.length > 0 &&
    queues.filter((q) => q.name.endsWith('.dlq')).every((q) => q.messages === 0);

  const hasData = ts.some((p) =>
    (p.impressions ?? 0) > 0 || (p.clicks ?? 0) > 0 || (p.conversions ?? 0) > 0
  );

  return (
    <div className="p-6 flex flex-col gap-5" style={{ height: '100vh' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Live Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lastUpdate
              ? `Updated ${lastUpdate.toLocaleTimeString('es-GT', { hour12: false })} · auto-refresh 5s`
              : 'Connecting...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-rose-500/10 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base">restart_alt</span>
            {resetting ? 'Resetting...' : 'Reset Data'}
          </button>
          <div className={`flex items-center gap-2 px-3 py-1.5 bg-slate-900 border rounded-lg ${allQueuesHealthy ? 'border-emerald-500/20' : queues.length === 0 ? 'border-slate-800' : 'border-amber-500/20'}`}>
            <span className={`h-2 w-2 rounded-full ${allQueuesHealthy ? 'bg-emerald-500 animate-pulse' : queues.length === 0 ? 'bg-slate-600' : 'bg-amber-500'}`} />
            <span className={`text-xs font-bold uppercase tracking-wider ${allQueuesHealthy ? 'text-emerald-400' : queues.length === 0 ? 'text-slate-500' : 'text-amber-400'}`}>
              {allQueuesHealthy ? 'Pipeline Healthy' : queues.length === 0 ? 'Connecting...' : 'Warning'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards — 4 cards, no Throughput */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Impressions"
          value={fmt(summary.impressions)}
          sub="last 24h"
          accent="border-indigo-500/20"
          icon="visibility"
          dotColor={summary.impressions > 0 ? 'bg-indigo-400' : undefined}
        />
        <KpiCard
          label="Clicks"
          value={fmt(summary.clicks)}
          sub="last 24h"
          accent="border-amber-500/20"
          icon="ads_click"
          dotColor={summary.clicks > 0 ? 'bg-amber-400' : undefined}
        />
        <KpiCard
          label="Conversions"
          value={fmt(summary.conversions)}
          sub="last 24h"
          accent="border-emerald-500/20"
          icon="shopping_cart"
          dotColor={summary.conversions > 0 ? 'bg-emerald-400' : undefined}
        />
        <KpiCard
          label="CTR"
          value={summary.ctr + '%'}
          sub="clicks / impressions"
          accent="border-violet-500/20"
          icon="insights"
        />
      </div>

      {/* Chart — full width, fills remaining vertical space */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Top accent bar */}
        <div className="h-px bg-gradient-to-r from-indigo-500/0 via-indigo-500/50 to-violet-500/0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Event Volume</h3>
              <p className="text-[10px] text-slate-500">Last 2 hours · 1-min windows</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleFireEvents}
              disabled={isFiring}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${
                isFiring
                  ? 'bg-slate-800 text-slate-500 cursor-wait border border-slate-700'
                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 hover:border-indigo-400/50 active:scale-95'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                {isFiring ? 'hourglass_empty' : 'bolt'}
              </span>
              {isFiring ? 'Sending...' : 'Fire Events'}
            </button>
            <LivePulse label="Live" />
          </div>
        </div>

        {/* Chart body — flex-1 so it fills all remaining card space */}
        <div className="px-6 pb-5 flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 relative">
            {hasData ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="h-full relative flex flex-col items-center justify-center">
                {/* Decorative ghost chart */}
                <svg
                  viewBox="0 0 800 200"
                  className="absolute inset-0 w-full h-full opacity-[0.07]"
                  preserveAspectRatio="none"
                >
                  {/* Grid lines */}
                  {[40, 80, 120, 160].map((y) => (
                    <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#64748b" strokeWidth="0.5" />
                  ))}
                  {[100, 200, 300, 400, 500, 600, 700].map((x) => (
                    <line key={x} x1={x} y1="0" x2={x} y2="200" stroke="#64748b" strokeWidth="0.5" />
                  ))}
                  {/* Ghost impressions line */}
                  <polyline
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="2"
                    points="0,160 80,140 160,100 240,80 320,90 400,60 480,50 560,70 640,55 720,40 800,60"
                  />
                  {/* Ghost clicks line */}
                  <polyline
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2"
                    points="0,180 80,170 160,155 240,145 320,148 400,130 480,120 560,135 640,125 720,110 800,120"
                  />
                  {/* Ghost conversions line */}
                  <polyline
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1.5"
                    points="0,195 80,192 160,188 240,183 320,185 400,178 480,174 560,179 640,175 720,168 800,172"
                  />
                </svg>

                {/* Center message */}
                <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                  <p className="text-sm font-semibold text-slate-400">No hay datos en las últimas 2 horas</p>
                  <p className="text-xs text-slate-600">
                    Usa{' '}
                    <button
                      onClick={handleFireEvents}
                      disabled={isFiring}
                      className="text-indigo-400 hover:text-indigo-300 font-mono underline underline-offset-2 disabled:opacity-50"
                    >
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

    </div>
  );
}
