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

const fmt = (n: number) => n.toLocaleString('en-US');

function KpiCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-indigo-500/40 transition-colors">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{label}</p>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
        <span className="material-symbols-outlined text-indigo-500 mb-1">{icon}</span>
      </div>
    </div>
  );
}

const TYPE_BADGE: Record<string, string> = {
  impressions: 'bg-indigo-500/10 text-indigo-400',
  clicks:      'bg-amber-500/10 text-amber-500',
  conversions: 'bg-emerald-500/10 text-emerald-400',
};

function QueueCard({ queue }: { queue: QueueStatus }) {
  const isDlq = queue.name.endsWith('.dlq');
  const color = isDlq && queue.messages > 0 ? 'text-rose-400' : isDlq ? 'text-slate-600' : 'text-indigo-400';
  const health = isDlq ? (queue.messages > 0 ? 'text-rose-400' : 'text-slate-600') : 'text-emerald-400';
  const healthLabel = isDlq ? (queue.messages > 0 ? 'Errors' : 'Empty') : 'Healthy';
  return (
    <div className="flex items-center justify-between p-4 bg-slate-950 rounded-lg border border-slate-800">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-8 rounded-full ${isDlq ? 'bg-rose-500/40' : 'bg-indigo-500'}`} />
        <div>
          <p className="text-xs font-bold text-slate-200 uppercase">{queue.name}</p>
          <p className="text-slate-500 text-[10px]">{queue.consumers} consumers</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-lg font-bold ${color}`}>{queue.messages} msgs</p>
        <p className={`text-[10px] font-bold ${health}`}>{healthLabel}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ts, setTs] = useState<TimePoint[]>([]);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [queues, setQueues] = useState<QueueStatus[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const [s, t, ev, q] = await Promise.all([
      fetchSummary().catch(() => null),
      fetchTimeseries().catch(() => [] as TimePoint[]),
      fetchRecentEvents().catch(() => [] as RecentEvent[]),
      fetchQueueStatus().catch(() => [] as QueueStatus[]),
    ]);
    if (s) setSummary(s);
    setTs(t);
    setEvents(ev);
    setQueues(q);
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 10000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const chartData = {
    labels: ts.map((p) =>
      new Date(p.time).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false })
    ),
    datasets: [
      { label: 'Impressions', data: ts.map((p) => p.impressions ?? 0), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', tension: 0.4, fill: true, pointRadius: 2 },
      { label: 'Clicks',      data: ts.map((p) => p.clicks ?? 0),      borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.4, fill: false, pointRadius: 2 },
      { label: 'Conversions', data: ts.map((p) => p.conversions ?? 0), borderColor: '#10b981', backgroundColor: 'transparent', tension: 0.4, fill: false, pointRadius: 2 },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } },
      y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } },
    },
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Dashboard</h2>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">System Healthy</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Impressions" value={summary ? fmt(summary.impressions) : '—'} icon="visibility" />
        <KpiCard label="Clicks"      value={summary ? fmt(summary.clicks) : '—'}      icon="ads_click" />
        <KpiCard label="Conversions" value={summary ? fmt(summary.conversions) : '—'} icon="shopping_cart" />
        <KpiCard label="CTR"         value={summary ? summary.ctr + '%' : '—'}         icon="insights" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Chart */}
        <div className="col-span-8 bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-4">Event Volume — Last 24h</h3>
          <div className="h-64">
            {ts.length > 0
              ? <Line data={chartData} options={chartOptions} />
              : <div className="h-full flex items-center justify-center text-slate-600 text-sm">Esperando datos...</div>
            }
          </div>
        </div>

        {/* Queue status */}
        <div className="col-span-4 bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-4">Queue Status</h3>
          <div className="space-y-3">
            {queues.length === 0
              ? <p className="text-slate-600 text-sm text-center py-8">Conectando...</p>
              : queues.map((q) => <QueueCard key={q.name} queue={q} />)
            }
          </div>
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-200">Recent Events</h3>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-950/50">
              <th className="px-6 py-3">Timestamp</th>
              <th className="px-6 py-3">Type</th>
              <th className="px-6 py-3">Payload</th>
              <th className="px-6 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-sm">
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-slate-600 text-sm">
                  Esperando eventos del profesor...
                </td>
              </tr>
            ) : (
              events.map((e, i) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-3 text-slate-400 font-mono text-xs">
                    {new Date(e.timestamp).toLocaleString('es-GT', { hour12: false })}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`${TYPE_BADGE[e.type] ?? 'bg-slate-500/10 text-slate-400'} text-[10px] font-bold px-2 py-0.5 rounded-full uppercase`}>
                      {e.type}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-500 font-mono text-xs truncate max-w-xs">
                    {e.payload.slice(0, 80)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-emerald-400 flex items-center justify-end gap-1.5 font-medium text-xs">
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
  );
}
