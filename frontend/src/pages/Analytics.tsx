import { useEffect, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
  type ChartOptions, type TooltipItem,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  fetchTopStates, fetchTopAdvertisers, fetchGauges, fetchLatencyAverages,
  type TopState, type TopAdvertiser, type Gauges, type LatencyAverages,
} from '../api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const EMPTY_GAUGES: Gauges = { ctr: 0, convRate: 0, impressions: 0, clicks: 0, conversions: 0 };
const EMPTY_LATENCY: LatencyAverages = { avgTimeToClick: 0, avgTimeToConvert: 0 };

function GaugeArc({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct  = Math.min(value / max, 1);
  const r    = 54;
  const circ = Math.PI * r; // half-circle arc length
  const dash = pct * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 70" className="w-40 overflow-visible">
        {/* background arc */}
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round"
        />
        {/* value arc */}
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${dash * 0.876} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="60" y="56" textAnchor="middle" fill="white" fontSize="16" fontWeight="800">
          {value.toFixed(1)}%
        </text>
      </svg>
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );
}

const barOpts = (): ChartOptions<'bar'> => ({
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${(ctx.parsed.x as number).toLocaleString()}` } },
  },
  scales: {
    x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 11 } } },
    y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 12, weight: 'bold' as const } } },
  },
});

export default function Analytics() {
  const [states,      setStates]      = useState<TopState[]>([]);
  const [advertisers, setAdvertisers] = useState<TopAdvertiser[]>([]);
  const [gauges,      setGauges]      = useState<Gauges>(EMPTY_GAUGES);
  const [latency,     setLatency]     = useState<LatencyAverages>(EMPTY_LATENCY);
  const [lastUpdate,  setLastUpdate]  = useState<Date | null>(null);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, a, g, l] = await Promise.all([
        fetchTopStates().catch(() => [] as TopState[]),
        fetchTopAdvertisers().catch(() => [] as TopAdvertiser[]),
        fetchGauges().catch(() => EMPTY_GAUGES),
        fetchLatencyAverages().catch(() => EMPTY_LATENCY),
      ]);
      setStates(s);
      setAdvertisers(a);
      setGauges(g);
      setLatency(l);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const statesData = {
    labels: states.map((s) => s.state),
    datasets: [{
      data:            states.map((s) => s.count),
      backgroundColor: 'rgba(99,102,241,0.7)',
      borderColor:     '#6366f1',
      borderWidth:     1,
      borderRadius:    4,
    }],
  };

  const advData = {
    labels: advertisers.map((a) => a.advertiser_id),
    datasets: [{
      data:            advertisers.map((a) => a.revenue),
      backgroundColor: 'rgba(16,185,129,0.7)',
      borderColor:     '#10b981',
      borderWidth:     1,
      borderRadius:    4,
    }],
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-lg font-black text-white tracking-tight">Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString('es-GT')} · cada 30s` : 'Cargando...'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">Cargando datos...</div>
      ) : (
        <div className="flex flex-col gap-6 p-6">

          {/* Gauges */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">
              CTR &amp; Conversion Rate — última hora
            </p>
            <div className="flex items-center justify-around flex-wrap gap-8">
              <GaugeArc value={gauges.ctr}     max={100} color="#6366f1" label="CTR" />
              <GaugeArc value={gauges.convRate} max={100} color="#10b981" label="Conv Rate" />
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-slate-400">Impresiones</span>
                  <span className="ml-auto font-bold text-white">{gauges.impressions.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-slate-400">Clicks</span>
                  <span className="ml-auto font-bold text-white">{gauges.clicks.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-slate-400">Conversiones</span>
                  <span className="ml-auto font-bold text-white">{gauges.conversions.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Avg time-to-click</p>
              <p className="mt-3 text-3xl font-black text-white">{latency.avgTimeToClick.toLocaleString()}s</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Avg time-to-convert</p>
              <p className="mt-3 text-3xl font-black text-white">{latency.avgTimeToConvert.toLocaleString()}s</p>
            </div>
          </div>

          {/* Bar charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Top 10 estados */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col gap-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Top 10 estados · impresiones · última hora
              </p>
              <div style={{ height: 280 }}>
                {states.length > 0
                  ? <Bar data={statesData} options={barOpts()} />
                  : <div className="h-full flex items-center justify-center text-slate-600 text-sm">Sin datos</div>
                }
              </div>
            </div>

            {/* Top 10 advertisers */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col gap-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Top 10 advertisers · revenue · últimas 24h
              </p>
              <div style={{ height: 280 }}>
                {advertisers.length > 0
                  ? <Bar data={advData} options={{
                      ...barOpts(),
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` $${(ctx.parsed.x as number).toLocaleString('en-US', { minimumFractionDigits: 2 })}` } },
                      },
                    }} />
                  : <div className="h-full flex items-center justify-center text-slate-600 text-sm">Sin datos</div>
                }
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
