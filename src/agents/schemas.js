export const ROUTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task_type: {
      type: 'string',
      enum: [
        'general',
        'strategy_finance',
        'ops_grants',
        'product_ux',
        'engineering',
        'summary',
      ],
    },
    primary_agent: {
      type: 'string',
      enum: [
        'general_cos',
        'strategy_finance',
        'ops_grants',
        'product_ux',
        'engineering',
      ],
    },
    include_risk: { type: 'boolean' },
    urgency: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    reason: { type: 'string' },
  },
  required: ['task_type', 'primary_agent', 'include_risk', 'urgency', 'reason'],
};

export const PRIMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    one_line_summary: { type: 'string' },
    recommendation: { type: 'string' },
    strongest_objection: { type: 'string' },
    key_risks: {
      type: 'array',
      items: { type: 'string' },
    },
    next_actions: {
      type: 'array',
      items: { type: 'string' },
    },
    ceo_decision_needed: { type: 'boolean' },
    ceo_decision_question: { type: 'string' },
  },
  required: [
    'one_line_summary',
    'recommendation',
    'strongest_objection',
    'key_risks',
    'next_actions',
    'ceo_decision_needed',
    'ceo_decision_question',
  ],
};

export const RISK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    strongest_objection: { type: 'string' },
    hidden_risks: {
      type: 'array',
      items: { type: 'string' },
    },
    reconsider_triggers: {
      type: 'array',
      items: { type: 'string' },
    },
    decision_should_pause: { type: 'boolean' },
  },
  required: [
    'strongest_objection',
    'hidden_risks',
    'reconsider_triggers',
    'decision_should_pause',
  ],
};
