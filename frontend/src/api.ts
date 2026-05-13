export interface Summary {
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: string;
}

export interface TimePoint {
  time: string;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface RecentEvent {
  timestamp: string;
  type: string;
  payload: string;
}

export interface QueueStatus {
  name: string;
  messages: number;
  consumers: number;
  publishRate: number;
  consumeRate: number;
}

export interface StorageCount {
  event_type: string;
  year: string;
  month: string;
  day: string;
  hour: string;
  prefix: string;
  count: number;
  truncated?: boolean;
}

export interface StorageObject {
  name: string;
  size: number;
  lastModified: string | null;
}

export interface StorageList {
  prefix: string;
  count: number;
  objects: StorageObject[];
}

const get = <T>(path: string): Promise<T> =>
  fetch(path).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json() as Promise<T>;
  });

export const fetchSummary   = () => get<Summary>('/api/metrics/summary');
export const fetchTimeseries = (window = '1m', range = '2h') =>
  get<TimePoint[]>(`/api/metrics/timeseries?window=${window}&range=${range}`);
export const fetchRecentEvents = () => get<RecentEvent[]>('/api/events/recent');
export const fetchQueueStatus  = () => get<QueueStatus[]>('/api/queues/status');

export const fetchStorageCount = (params: Record<string, string> = {}) => {
  const q = new URLSearchParams(params).toString();
  return get<StorageCount>(`/api/storage/count${q ? `?${q}` : ''}`);
};

export const fetchStorageList = (params: Record<string, string> = {}) => {
  const q = new URLSearchParams(params).toString();
  return get<StorageList>(`/api/storage/list${q ? `?${q}` : ''}`);
};

export const fireEvent = (queue: string, payload: object) =>
  fetch(`/api/events/${queue}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export interface TopState    { state: string; count: number }
export interface TopAdvertiser { advertiser_id: string; revenue: number }
export interface Gauges { ctr: number; convRate: number; impressions: number; clicks: number; conversions: number }

export const fetchTopStates      = () => get<TopState[]>('/api/analytics/top-states');
export const fetchTopAdvertisers = () => get<TopAdvertiser[]>('/api/analytics/top-advertisers');
export const fetchGauges         = () => get<Gauges>('/api/analytics/gauges');

export const resetData = () =>
  fetch('/api/reset', { method: 'POST' }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<{ reset: boolean }>;
  });

export function createStream(
  onData: (d: { summary: Summary; queues: QueueStatus[] }) => void,
  onError?: () => void,
): EventSource {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => {
    try { onData(JSON.parse(e.data as string)); } catch { /* ignore parse errors */ }
  };
  es.onerror = () => { onError?.(); };
  return es;
}
