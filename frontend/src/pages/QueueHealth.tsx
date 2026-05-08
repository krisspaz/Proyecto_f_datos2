import { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { fetchQueueStatus, type QueueStatus } from '../api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function QueueCard({ q }: { q: QueueStatus }) {
  const isHealthy = q.messages < 1000;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-bold text-slate-100 uppercase text-sm">{q.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{q.consumers} consumer{q.consumers !== 1 ? 's' : ''}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
          {isHealthy ? 'Healthy' : 'Backlog'}
        </span>
      </div>
      <p className="text-4xl font-black text-white mb-4">{q.messages.toLocaleString()}</p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-950 rounded-lg p-3">
          <p className="text-slate-500 mb-1">Publish rate</p>
          <p className="font-bold text-indigo-400">{q.publishRate.toFixed(1)} msg/s</p>
        </div>
        <div className="bg-slate-950 rounded-lg p-3">
          <p className="text-slate-500 mb-1">Consume rate</p>
          <p className="font-bold text-emerald-400">{q.consumeRate.toFixed(1)} msg/s</p>
        </div>
      </div>
    </div>
  );
}

function DlqCard({ q }: { q: QueueStatus }) {
  const hasErrors = q.messages > 0;
  return (
    <div className={`bg-slate-900 border rounded-xl p-4 ${hasErrors ? 'border-rose-500/30' : 'border-slate-800'}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="font-bold text-slate-300 text-sm uppercase">{q.name}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${hasErrors ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-500'}`}>
          {hasErrors ? `${q.messages} errors` : 'Empty'}
        </span>
      </div>
      <p className="text-xs text-slate-600">
        {hasErrors ? 'Mensajes pendientes en DLQ — revisar' : 'Sin mensajes muertos'}
      </p>
    </div>
  );
}

export default function QueueHealth() {
  const [queues, setQueues] = useState<QueueStatus[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const q = await fetchQueueStatus().catch(() => [] as QueueStatus[]);
    setQueues(q);
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 10000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const main = queues.filter((q) => !q.name.endsWith('.dlq'));
  const dlqs = queues.filter((q) => q.name.endsWith('.dlq'));

  const chartData = {
    labels: main.map((q) => q.name),
    datasets: [
      { label: 'Publish rate', data: main.map((q) => q.publishRate), backgroundColor: '#6366f1' },
      { label: 'Consume rate', data: main.map((q) => q.consumeRate), backgroundColor: '#10b981' },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
      y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
    },
  };

  const allHealthy = main.every((q) => q.messages < 1000);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Queue Health</h2>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${allHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${allHealthy ? 'text-emerald-500' : 'text-amber-500'}`}>
            {allHealthy ? 'All Queues Healthy' : 'Backlog Detected'}
          </span>
        </div>
      </div>

      {/* Main queues */}
      {main.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-600">
          Conectando con RabbitMQ...
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {main.map((q) => <QueueCard key={q.name} q={q} />)}
        </div>
      )}

      {/* DLQs */}
      {dlqs.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Dead Letter Queues</h3>
          <div className="grid grid-cols-3 gap-4">
            {dlqs.map((q) => <DlqCard key={q.name} q={q} />)}
          </div>
        </div>
      )}

      {/* Throughput chart */}
      {main.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-4">Throughput — Publish vs Consume (msg/s)</h3>
          <div className="h-48">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* Connection info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Exchange: <span className="text-slate-300 font-mono">events</span> (direct, durable)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-500/60" />
          <span>DLX: <span className="text-slate-300 font-mono">events.dlx</span></span>
        </div>
        <div className="ml-auto">
          <span>{queues.length} queues monitored</span>
        </div>
      </div>
    </div>
  );
}
