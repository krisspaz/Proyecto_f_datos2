import { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  fetchSummary, fetchTimeseries, fetchRecentEvents, fetchQueueStatus,
  type Summary, type TimePoint, type RecentEvent, type QueueStatus,
} from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const fmt = (n: number) => n >= 1_000_000
  ? (n / 1_000_000).toFixed(1) + 'M'
  : n >= 1_000
  ? (n / 1_000).toFixed(1) + 'K'
  : n.toLocaleString('en-US');

const TYPE_BADGE: Record<string, string> = {
  impressions: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
  clicks:      'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  conversions: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
};

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  icon: string;
  live?: boolean;
}

function KpiCard({ label, value, sub, accent, icon, live }: KpiProps) {
  return (
    <div className={`relative bg-slate-900 border rounded-xl p-5 overflow-hidden ${accent}`}>
      <div className="absolute inset-0 opacity-[0.03] bg-gradient-to-br from-white to-transparent pointer-events-none" />
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <div className="flex items-center gap-1.5">
          {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          <span className="material-symbols-outlined text-base text-slate-600">{icon}</span>
        </div>
      </div>
      <p className="text-3xl font-black text-white tracking-tight leading-none">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1.5">{sub}</p>}
    </div>
  );
}

function QueueRow({ queue }: { queue: QueueStatus }) {
  const isDlq = queue.name.endsWith('.dlq');
  const hasMessages = queue.messages > 0;
  const statusColor = isDlq
    ? hasMessages ? 'text-rose-400' : 'text-slate-600'
    : 'text-emerald-400';
  const dotColor = isDlq
    ? hasMessages ? 'bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]' : 'bg-slate-700'
    : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]';

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-950/60 border border-slate-800/60 hover:border-slate-700 transition-colors">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-200 uppercase truncate">{queue.name}</p>
        <p className="text-[10px] text-slate-600">{queue.consumers} consumer{queue.consumers !== 1 ? 's' : ''}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-black ${statusColor}`}>{fmt(queue.messages)}</p>
        <p className="text-[10px] text-slate-600">msgs</p>
      </div>
    </div>
  );
}

function computeEventsPerSec(ts: TimePoint[]): number {
  if (ts.length < 2) return 0;
  // Second-to-last bucket is the last completed 1-minute window
  const bucket = ts[ts.length - 2];
  const total = (bucket.impressions ?? 0) + (bucket.clicks ?? 0) + (bucket.conversions ?? 0);
  return Math.round(total / 60);
}

export default function Dashboard() {
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [ts, setTs]             = useState<TimePoint[]>([]);
  const [events, setEvents]     = useState<RecentEvent[]>([]);
  const [queues, setQueues]     = useState<QueueStatus[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const [s, t, ev, q] = await Promise.all([
      fetchSummary().catch(() => null),
      fetchTimeseries('1m', '2h').catch(() => [] as TimePoint[]),
      fetchRecentEvents().catch(() => [] as RecentEvent[]),
      fetchQueueStatus().catch(() => [] as QueueStatus[]),
    ]);
    if (s) setSummary(s);
    setTs(t);
    setEvents(ev);
    setQueues(q);
    setLastUpdate(new Date());
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const evPerSec = computeEventsPerSec(ts);

  const chartData = {
    labels: ts.map((p) =>
      new Date(p.time).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false })
    ),
    datasets: [
      {
        label: 'Impressions',
        data: ts.map((p) => p.impressions ?? 0),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: 'Clicks',
        data: ts.map((p) => p.clicks ?? 0),
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        tension: 0.3,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: 'Conversions',
        data: ts.map((p) => p.conversions ?? 0),
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        tension: 0.3,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4,
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
        labels: { color: '#94a3b8', boxWidth: 10, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
      },
    },
    scales: {
      x: {
        ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 12 },
        grid: { color: 'rgba(30,41,59,0.8)' },
      },
      y: {
        ticks: { color: '#475569', font: { size: 10 } },
        grid: { color: 'rgba(30,41,59,0.8)' },
        beginAtZero: true,
      },
    },
  };

  const allQueuesHealthy = queues.length > 0 &&
    queues.filter((q) => q.name.endsWith('.dlq')).every((q) => q.messages === 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Live Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString('es-GT', { hour12: false })} · auto-refresh 5s` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
          <span className={`h-2 w-2 rounded-full ${allQueuesHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${allQueuesHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>
            {allQueuesHealthy ? 'Pipeline Healthy' : 'Checking...'}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard
          label="Impressions"
          value={summary ? fmt(summary.impressions) : '—'}
          sub="last 24h"
          accent="border-indigo-500/20"
          icon="visibility"
        />
        <KpiCard
          label="Clicks"
          value={summary ? fmt(summary.clicks) : '—'}
          sub="last 24h"
          accent="border-amber-500/20"
          icon="ads_click"
        />
        <KpiCard
          label="Conversions"
          value={summary ? fmt(summary.conversions) : '—'}
          sub="last 24h"
          accent="border-emerald-500/20"
          icon="shopping_cart"
        />
        <KpiCard
          label="CTR"
          value={summary ? summary.ctr + '%' : '—'}
          sub="clicks / impressions"
          accent="border-violet-500/20"
          icon="insights"
        />
        <KpiCard
          label="Throughput"
          value={evPerSec > 0 ? `${fmt(evPerSec)}/s` : '—'}
          sub="events per second"
          accent="border-rose-500/20"
          icon="speed"
          live
        />
      </div>

      {/* Chart + Queue panel */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-9 bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-200">Event Volume — Last 2h (1-min buckets)</h3>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
          <div className="h-56">
            {ts.length > 0
              ? <Line data={chartData} options={chartOptions} />
              : <div className="h-full flex items-center justify-center text-slate-600 text-sm">Esperando datos...</div>
            }
          </div>
        </div>

        <div className="col-span-3 bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-3">Queue Status</h3>
          <div className="space-y-2">
            {queues.length === 0
              ? <p className="text-slate-600 text-xs text-center py-8">Conectando...</p>
              : queues.map((q) => <QueueRow key={q.name} queue={q} />)
            }
          </div>
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200">Recent Events</h3>
          <span className="text-[10px] text-slate-600">last hour · top 20</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-950/50">
                <th className="px-6 py-3 w-44">Timestamp</th>
                <th className="px-6 py-3 w-28">Type</th>
                <th className="px-6 py-3">Payload</th>
                <th className="px-6 py-3 w-20 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-600 text-sm">
                    Esperando eventos...
                  </td>
                </tr>
              ) : (
                events.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-2.5 text-slate-500 font-mono text-xs whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString('es-GT', { hour12: false })}
                    </td>
                    <td className="px-6 py-2.5">
                      <span className={`${TYPE_BADGE[e.type] ?? 'bg-slate-500/10 text-slate-400'} text-[10px] font-bold px-2 py-0.5 rounded-full uppercase`}>
                        {e.type}
                      </span>
                    </td>
                    <td className="px-6 py-2.5 text-slate-500 font-mono text-xs truncate max-w-0 w-full">
                      {e.payload.slice(0, 100)}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        OK
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
