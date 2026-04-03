# COS vNext.13.1 — Founder Kernel Final Lock + Default-Deny Approval

**Authority:** 런타임 코드와 동기화된 운영 메모  
**날짜:** 2026-04-03

## 요약

창업자 커널을 `src/founder/founderDirectKernel.js`로 분리하고 `founderRequestPipeline.js`는 오퍼레이터 spine 전용으로 한정했다. `isExternalMutationAuthorized`는 명시 `authorized`만 허용(default-deny).

## 핵심 파일

- `runFounderDirectKernel` — app.js, runInboundAiRouter
- `founderRequestPipeline` — 채널 등 비창업자
- `approvalGate.js` — default-deny
- `founderProposalKernel.js` — 외부 실행은 mutation 의도가 있을 때만
- `founderApprovalPacket.js` — 승인 패킷 본문

## 테스트

`scripts/test-vnext13-1-founder-kernel-final-lock.mjs`, 기존 vNext.13 여섯 스크립트.

## Owner actions

### 로컬 검증

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

### Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.1 founder direct kernel split and default-deny approval"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
