# Approval & escalation policy (vNext.13.2)

## 승인 패킷 (“결제” 표면)

`src/orchestration/approvalPacketFormatter.js` + `src/founder/founderApprovalPacket.js`

포함 항목:

1. 왜 COS_ONLY로 끝내지 않고 external execution이 필요한지  
2. 바뀌는 external system  
3. 예상 액션·아티팩트  
4. rollback / kill point  
5. 승인하지 않을 때의 draft-only 대안  

## 문구 규칙 (창업자 면)

상수: `src/orchestration/harnessEscalationPolicy.js` — `FOUNDER_APPROVAL_WORDING`

- 승인 **전:** 실행을 약속하는 표현 대신 **승인 요청** 톤.  
- 승인 **후:** 디스패치 개시 안내.  
- **보류:** 내부 초안·정리만 유지.

## 보류 → draft_only

`src/orchestration/approvalGate.js` — `holdExternalExecutionForRun(runId)` → `external_execution_authorization.state === 'draft_only'` (default-deny와 정합).

## 에스컬레이션 (창업자에게 되돌림)

`ESCALATION_RETURN_TO_FOUNDER_CONDITIONS` — 예: scope 모호, provider truth 부족, 리스크 과다, IR/법무 민감, deploy 직전, 에이전트 충돌, QA/audit 불일치.

## 회귀

`npm test` → `test-vnext13-2-approval-escalation-language.mjs`
