import { useState, useEffect, useCallback } from 'react';
import { fetchStorageCount, fetchStorageList, type StorageCount, type StorageObject } from '../api';

const EVENT_TYPES = ['impressions', 'clicks', 'conversions'] as const;
type EventType = (typeof EVENT_TYPES)[number];

const TYPE_ACCENT: Record<EventType, string> = {
  impressions: 'border-indigo-500/20 text-indigo-400',
  clicks:      'border-amber-500/20 text-amber-400',
  conversions: 'border-emerald-500/20 text-emerald-400',
};

const TYPE_ICON: Record<EventType, string> = {
  impressions: 'visibility',
  clicks:      'ads_click',
  conversions: 'shopping_cart',
};

function nowParams() {
  const n = new Date();
  return {
    year:  String(n.getFullYear()),
    month: String(n.getMonth() + 1).padStart(2, '0'),
    day:   String(n.getDate()).padStart(2, '0'),
    hour:  String(n.getHours()).padStart(2, '0'),
  };
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function shortKey(name: string) {
  const parts = name.split('/');
  return parts[parts.length - 1] ?? name;
}

export default function Storage() {
  const [counts, setCounts] = useState<Record<EventType, number>>({ impressions: 0, clicks: 0, conversions: 0 });
  const [loading, setLoading] = useState(true);
  const [browserType, setBrowserType] = useState<EventType>('impressions');
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [listMeta, setListMeta] = useState<Omit<StorageCount, 'count'> | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const [truncated, setTruncated] = useState<Record<EventType, boolean>>({ impressions: false, clicks: false, conversions: false });

  const loadCounts = useCallback(async () => {
    setLoading(true);
    const np = nowParams();
    const results = await Promise.all(
      EVENT_TYPES.map((t) => fetchStorageCount({ event_type: t, ...np }).catch(() => null))
    );
    const next = { impressions: 0, clicks: 0, conversions: 0 };
    const trunc = { impressions: false, clicks: false, conversions: false };
    results.forEach((r, i) => { if (r) { next[EVENT_TYPES[i]] = r.count; trunc[EVENT_TYPES[i]] = r.truncated ?? false; } });
    setCounts(next);
    setTruncated(trunc);
    setLoading(false);
  }, []);

  const loadList = useCallback(async (type: EventType) => {
    setListLoading(true);
    const np = nowParams();
    try {
      const res = await fetchStorageList({ event_type: type, ...np });
      setObjects(res.objects);
      setListMeta({ event_type: res.prefix.split('/')[1] ?? type, ...np, prefix: res.prefix });
    } catch {
      setObjects([]);
    }
    setListLoading(false);
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);
  useEffect(() => { loadList(browserType); }, [browserType, loadList]);

  const np = nowParams();
  const partitionLabel = `year=${np.year}/month=${np.month}/day=${np.day}/hour=${np.hour}`;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Storage</h2>
          <p className="text-xs text-slate-500 mt-0.5">MinIO object store — partition: {partitionLabel}</p>
        </div>
        <button
          onClick={() => { loadCounts(); loadList(browserType); }}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 hover:border-slate-700 px-3 py-2 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Refresh
        </button>
      </div>

      {/* Reconciliation cards */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
          Files persisted — current hour
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {EVENT_TYPES.map((t) => (
            <div
              key={t}
              onClick={() => setBrowserType(t)}
              className={`bg-slate-900 border rounded-xl p-5 cursor-pointer transition-colors hover:border-slate-700 ${
                browserType === t ? TYPE_ACCENT[t].split(' ')[0] + ' ' + TYPE_ACCENT[t].split(' ')[0].replace('border', 'ring-1 ring') : 'border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t}</p>
                <span className="material-symbols-outlined text-base text-slate-600">{TYPE_ICON[t]}</span>
              </div>
              <p className={`text-4xl font-black ${loading ? 'text-slate-700' : TYPE_ACCENT[t].split(' ')[1]}`}>
                {loading ? '—' : counts[t].toLocaleString('en-US') + (truncated[t] ? '+' : '')}
              </p>
              <p className="text-[10px] text-slate-600 mt-1.5">files in MinIO{truncated[t] ? ' (sample)' : ''}</p>
            </div>
          ))}
        </div>
      </div>

      {/* File browser */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-200">File Browser</h3>
            <div className="flex rounded-lg overflow-hidden border border-slate-800">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setBrowserType(t)}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 transition-colors ${
                    browserType === t
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {listMeta && (
            <p className="text-[10px] text-slate-600 font-mono">{listMeta.prefix}</p>
          )}
        </div>

        {listLoading ? (
          <div className="px-6 py-12 text-center text-slate-600 text-sm">Loading...</div>
        ) : objects.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-600 text-sm">
            No files in this partition yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-950/50">
                  <th className="px-6 py-3">Filename</th>
                  <th className="px-6 py-3 w-24">Size</th>
                  <th className="px-6 py-3 w-44">Last Modified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {objects.slice(0, 100).map((obj, i) => (
                  <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-2.5 font-mono text-xs text-slate-400">{shortKey(obj.name)}</td>
                    <td className="px-6 py-2.5 text-xs text-slate-500">{fmtBytes(obj.size)}</td>
                    <td className="px-6 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {obj.lastModified ? new Date(obj.lastModified).toLocaleString('es-GT', { hour12: false }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {objects.length > 100 && (
              <p className="px-6 py-3 text-[10px] text-slate-600 border-t border-slate-800">
                Showing 100 of {objects.length.toLocaleString('en-US')} files.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
