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

const get = <T>(path: string): Promise<T> =>
  fetch(path).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json() as Promise<T>;
  });

export const fetchSummary = () => get<Summary>('/api/metrics/summary');
export const fetchTimeseries = () => get<TimePoint[]>('/api/metrics/timeseries');
export const fetchRecentEvents = () => get<RecentEvent[]>('/api/events/recent');
export const fetchQueueStatus = () => get<QueueStatus[]>('/api/queues/status');

export const fireEvent = (queue: string, payload: object) =>
  fetch(`/api/events/${queue}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
