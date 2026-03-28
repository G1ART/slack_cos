# 제품 주인 MVP 정의 (2026-03-27)

**Authority role:** Owner-stated product outcome loop (what “MVP success” means for this Slack COS).

**Can define:**

- The **four-part loop** below: natural-language lock-in with COS → approved execution with trace → deploy/feedback → multi-domain reuse.

**Cannot override:**

- `COS_Project_Directive_NorthStar_FastTrack_v1.md` non-negotiables or §1c read order  
- **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** — milestones, **build-order lock**, no-go lines (this document does **not** replace M1–M5 ordering)

**Use when:**

- Resolving “what MVP means” in conversation, Cursor, or ChatGPT — prefer this file over ad-hoc restatement.

**관계:** `COS_Project_Directive_NorthStar_FastTrack_v1.md` §1b(북극성 비전 1–6항)과 **같은 방향**. 본 문서는 그것을 **아이디어 락인 → 구현·감사 → 배포·피드백 → 확장**으로 **한 루프**에 묶어 서술한다. 질적 서술·영문 체크리스트는 지원 문서 `COS_NorthStar_ReLock_Directive_2026-03.md` §5와 병행 참고.

---

## MVP — 제품 주인 4항 (정본 본문)

1. 나는 슬랙 안에서 COS라는 비서실장 AI agent 와 자연어로 ChatGPT 를 쓰듯이 자유롭게 대화하고 영감을 주고받으면서 새로운 앱이나 플랫폼의 형태와 기능, 취지와 타겟 고객 등을 락인한다.

2. 구현하고자 하는 앱이나 플랫폼이 충분히 구체화되고 내가 승인하면 COS 는 이미 슬랙 안에 내재된 multi-persona AI agent 들과 서로 견제하고 협력하면서 외부 툴(Cursor, Supabase, Github 등, but not limited to those)과 연동해 24/7 traceable 하게 작업하여 프로덕트를 빠르게 완성한다.

3. COS의 보고와 나의 승인을 통해 프로덕트(앱/플랫폼 등)를 배포하고, 빠르게 피드백을 받는다. 피드백은 슬랙을 통해 COS에게 전달되고, COS는 필요와 판단에 따라 내 승인을 얻거나 승인 없이도 피드백 개선 작업을 분배하여 실시한다.

4. 이 슬랙 툴은 앱/플랫폼 제작 및 배포 뿐만 아니라 다채롭게 쓰일 수 있다 (예를 들면 IR 준비, 정부과제 검색/준비/지원, 전략 수립, 버짓 관리 등).

---

## Owner actions

코드 변경 없음 — 문서 정합용. 패치 후 검증 관례:

```bash
cd /path/to/g1-cos-slack && npm test
```

SQL: 없음.
