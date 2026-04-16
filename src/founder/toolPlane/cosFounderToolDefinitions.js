/**
 * Founder COS Responses API — tool definitions (OpenAI-shaped) and shared enums.
 */

export const ALLOWED_EXTERNAL_TOOLS = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);

export const INVOKE_ACTION_ENUM = [
  'create_spec',
  'emit_patch',
  'create_issue',
  'open_pr',
  'apply_sql',
  'deploy',
  'inspect_logs',
];

export const PERSONA_ENUM_ARR = ['research', 'pm', 'engineering', 'design', 'qa', 'data'];
export const PREFERRED_TOOL_ENUM = ['cursor', 'github', 'supabase', 'vercel', 'railway'];

/** nullable 배열 (strict에서 선택 필드) */
const NULLABLE_STRING_ARRAY = {
  anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
};

const NULLABLE_PERSONA_ARRAY = {
  anyOf: [{ type: 'array', items: { type: 'string', enum: PERSONA_ENUM_ARR } }, { type: 'null' }],
};

const DELEGATE_HARNESS_REQUIRED_KEYS = [
  'objective',
  'personas',
  'tasks',
  'deliverables',
  'constraints',
  'success_criteria',
  'risks',
  'review_checkpoints',
  'open_questions',
  'packets',
];

const DELEGATE_PACKET_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    packet_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'optional stable packet id',
    },
    persona: {
      type: 'string',
      enum: PERSONA_ENUM_ARR,
      description: 'packet owner persona',
    },
    mission: { type: 'string', description: 'packet mission' },
    inputs: {
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
      description: 'inputs; null for defaults',
    },
    deliverables: {
      type: 'array',
      items: { type: 'string' },
      description: 'deliverables',
    },
    definition_of_done: {
      type: 'array',
      items: { type: 'string' },
      description: 'definition of done',
    },
    handoff_to: { type: 'string', description: 'next persona or empty string' },
    artifact_format: { type: 'string', description: 'artifact format key' },
    preferred_tool: {
      anyOf: [{ type: 'string', enum: PREFERRED_TOOL_ENUM }, { type: 'null' }],
      description: 'preferred tool or null',
    },
    preferred_action: {
      anyOf: [{ type: 'string', enum: INVOKE_ACTION_ENUM }, { type: 'null' }],
      description: 'preferred action or null',
    },
    review_required: {
      anyOf: [{ type: 'boolean' }, { type: 'null' }],
      description: 'review gate or null',
    },
    review_focus: {
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
      description: 'review focus topics or null',
    },
    packet_status: {
      anyOf: [{ type: 'string', enum: ['draft', 'ready'] }, { type: 'null' }],
      description: 'draft|ready or null',
    },
    live_patch: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', description: 'single repo-relative path' },
            operation: { type: 'string', enum: ['create', 'replace'], description: 'file operation' },
            content: { type: 'string', description: 'full exact file content' },
            live_only: { type: 'boolean', description: 'must be true for narrow automation' },
            no_fallback: { type: 'boolean', description: 'must be true for narrow automation' },
          },
          required: ['path', 'operation', 'content', 'live_only', 'no_fallback'],
        },
        { type: 'null' },
      ],
      description: 'closed single-file patch or null',
    },
    success_criteria: {
      anyOf: [{ type: 'string', description: 'optional one-line completion check' }, { type: 'null' }],
      description: 'Phase1 packet envelope; null if none',
    },
  },
  required: [
    'packet_id',
    'persona',
    'mission',
    'inputs',
    'deliverables',
    'definition_of_done',
    'handoff_to',
    'artifact_format',
    'preferred_tool',
    'preferred_action',
    'review_required',
    'review_focus',
    'packet_status',
    'live_patch',
    'success_criteria',
  ],
};

export const COS_TOOLS = [
  {
    type: 'function',
    name: 'delegate_harness_team',
    description:
      'Harness 내부 실행 조직·work packet. 대부분은 packets=null로 두고 서버가 objective·페르소나로 envelope를 만든다. 아주 좁게 닫힌 단일 파일 live patch(create|replace, exact content, live_only+no_fallback)만 packets에 live_patch를 실을 수 있다. founder에게 원시 artifact를 보이지 말 것.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: '달성 목표 한 줄' },
        personas: {
          ...NULLABLE_PERSONA_ARRAY,
          description: '투입 페르소나; 없으면 null',
        },
        tasks: { ...NULLABLE_STRING_ARRAY, description: '세부 작업; 없으면 null' },
        deliverables: { ...NULLABLE_STRING_ARRAY, description: '기대 산출물; 없으면 null' },
        constraints: { ...NULLABLE_STRING_ARRAY, description: '제약·가정; 없으면 null' },
        success_criteria: { ...NULLABLE_STRING_ARRAY, description: '성공 기준; 없으면 null' },
        risks: { ...NULLABLE_STRING_ARRAY, description: '리스크; 없으면 null' },
        review_checkpoints: { ...NULLABLE_STRING_ARRAY, description: '리뷰 체크포인트; 없으면 null' },
        open_questions: { ...NULLABLE_STRING_ARRAY, description: '미결 질문; 없으면 null' },
        packets: {
          anyOf: [{ type: 'array', items: DELEGATE_PACKET_ITEM_SCHEMA }, { type: 'null' }],
          description:
            '선택 패킷 배열 또는 null. live_patch 사용 시 단일 경로·exact content·live_only·no_fallback 필수.',
        },
      },
      required: DELEGATE_HARNESS_REQUIRED_KEYS,
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'invoke_external_tool',
    description:
      '외부 도구. live가 불가하면 artifact fallback. 불필요한 남발 없이 최소 호출. founder 표면은 자연어만.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          enum: ['cursor', 'github', 'supabase', 'vercel', 'railway'],
          description: '호출할 외부 도구',
        },
        action: {
          type: 'string',
          enum: INVOKE_ACTION_ENUM,
          description:
            'cursor: create_spec|emit_patch · github: create_issue|open_pr · supabase: apply_sql · vercel: deploy · railway: inspect_logs|deploy',
        },
        payload: {
          type: 'object',
          additionalProperties: true,
          description: '도구별 인자 (빈 객체도 허용)',
        },
      },
      required: ['tool', 'action', 'payload'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'record_execution_note',
    description:
      '내부 운영 메모(예: packet 축소, 페르소나 과사용). founder 비노출. ledger visibility용.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: '한 줄 요약 (내부용)' },
        detail: {
          anyOf: [
            {
              type: 'string',
              description: '선택 구조화 디테일(JSON 객체를 문자열로) 또는 빈 문자열; 없으면 null',
            },
            { type: 'null' },
          ],
          description: 'JSON 문자열 또는 null(OpenAI strict 호환)',
        },
      },
      required: ['note', 'detail'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read_execution_context',
    description:
      'COS 자기 점검·맥락 재동기화용: 최근 ledger 요약(summary_lines, 스레드 전체)·execution_summary_active_run(활성 durable 런에 매칭되는 요약 줄만; 없으면 null)·parcel_ledger_closure_mirror(count+latest_ts, authoritative closure mirror append 횟수)·raw artifact·adapter readiness·review_queue·실행 집계·recent_artifact_spine_distinct·active_run_shell·tenancy_keys_presence·parcel_deployment_scoped_supervisor_lists. Supabase ops 요약·ledger 한 줄과 동일 truth 로 취급하지 말 것. 불확실하면 founder에게 말하기 전 같은 턴에서 호출할 것. founder에게 그대로 노출하지 말 것.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          anyOf: [{ type: 'integer', minimum: 1, maximum: 20 }, { type: 'null' }],
          description: '최대 개수 (1–20); 기본 5는 null',
        },
      },
      required: ['limit'],
      additionalProperties: false,
    },
  },
];
