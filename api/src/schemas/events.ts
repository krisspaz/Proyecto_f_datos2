/**
 * Cuerpos esperados (stress tool / enunciado). additionalProperties: true
 * para no rechazar campos extra que envíe el generador de carga.
 */
export const impressionBodySchema = {
  type: 'object',
  additionalProperties: true,
  required: [
    'impression_id',
    'user_ip',
    'user_agent',
    'timestamp',
    'state',
    'search_keywords',
    'session_id',
    'ads',
  ],
  properties: {
    impression_id: { type: 'string' },
    user_ip: { type: 'string' },
    user_agent: { type: 'string' },
    timestamp: { type: 'string' },
    state: { type: 'string' },
    search_keywords: { type: 'string' },
    session_id: { type: 'string' },
    ads: { type: 'array' },
  },
} as const;

export const clickBodySchema = {
  type: 'object',
  additionalProperties: true,
  required: ['click_id', 'impression_id', 'timestamp', 'clicked_ad', 'user_info'],
  properties: {
    click_id: { type: 'string' },
    impression_id: { type: 'string' },
    timestamp: { type: 'string' },
    clicked_ad: { type: 'object', additionalProperties: true },
    user_info: { type: 'object', additionalProperties: true },
  },
} as const;

export const conversionBodySchema = {
  type: 'object',
  additionalProperties: true,
  required: [
    'conversion_id',
    'click_id',
    'impression_id',
    'timestamp',
    'conversion_type',
    'conversion_value',
    'conversion_currency',
    'conversion_attributes',
    'attribution_info',
    'user_info',
  ],
  properties: {
    conversion_id: { type: 'string' },
    click_id: { type: 'string' },
    impression_id: { type: 'string' },
    timestamp: { type: 'string' },
    conversion_type: { type: 'string' },
    conversion_value: { type: 'number' },
    conversion_currency: { type: 'string' },
    conversion_attributes: { type: 'object', additionalProperties: true },
    attribution_info: { type: 'object', additionalProperties: true },
    user_info: { type: 'object', additionalProperties: true },
  },
} as const;

export const accepted202Schema = {
  type: 'object',
  properties: {
    accepted: { type: 'boolean' },
  },
} as const;
