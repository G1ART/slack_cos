#!/usr/bin/env node
/** Fast-Track surface intent + executive response 스모크 */
import assert from 'node:assert/strict';
import { classifySurfaceIntent } from '../src/features/surfaceIntentClassifier.js';
import { tryExecutiveSurfaceResponse } from '../src/features/tryExecutiveSurfaceResponse.js';

assert.equal(classifySurfaceIntent('상태점검'), null);
assert.equal(classifySurfaceIntent('계획상세 PLN-X'), null);

const st = classifySurfaceIntent('지금 상태 보여줘');
assert.ok(st && st.intent === 'ask_status');

const sp = classifySurfaceIntent('프로젝트시작: 예약 MVP');
assert.ok(sp && sp.intent === 'start_project' && sp.body.includes('예약'));

const dc = classifySurfaceIntent('결정비교: 온보딩 범위');
assert.ok(dc && dc.intent === 'decision_compare' && dc.body.includes('온보딩'));

const txt = await tryExecutiveSurfaceResponse('현재 상태');
assert.ok(txt.text.includes('상태 패킷'), txt.text);
assert.ok(txt.text.includes('STP-'), txt.text);
assert.ok(txt.status_packet_id && /^STP-/i.test(txt.status_packet_id), txt.status_packet_id);
assert.equal(txt.response_type, 'ask_status');

const proj = await tryExecutiveSurfaceResponse('툴시작: 결제 연동');
assert.ok(proj.text.includes('정렬'), proj.text);
assert.equal(proj.response_type, 'start_project');

const multilineStart = classifySurfaceIntent('안녕하세요\n툴제작: 멀티라인 스펙');
assert.ok(
  multilineStart && multilineStart.intent === 'start_project' && multilineStart.body.includes('멀티라인'),
  multilineStart,
);
const g1cosGlue = classifySurfaceIntent('G1COS툴제작: 접두 붙임');
assert.ok(g1cosGlue && g1cosGlue.intent === 'start_project' && g1cosGlue.body.includes('접두'), g1cosGlue);

const tm = classifySurfaceIntent('툴제작: 내부 어드민 롤백 버튼');
assert.ok(tm && tm.intent === 'start_project' && tm.body.includes('어드민'), tm);

const pkt = await tryExecutiveSurfaceResponse('결정비교: A/B 테스트');
assert.ok(pkt.packet_id && pkt.text.includes('결정 패킷'), pkt.text);

const sr = classifySurfaceIntent('전략 검토: 가격 정책');
assert.ok(sr && sr.intent === 'request_strategy_review' && sr.body.includes('가격'));
const srx = await tryExecutiveSurfaceResponse('전략 검토: 가격 정책');
assert.ok(srx.response_type === 'request_strategy_review' && srx.text.includes('협의모드'), srx.text);

const rr = classifySurfaceIntent('리스크 검토: 단일 장애점');
assert.ok(rr && rr.intent === 'request_risk_review');
const rrx = await tryExecutiveSurfaceResponse('리스크 검토: 단일 장애점');
assert.ok(rrx.response_type === 'request_risk_review' && rrx.text.includes('협의모드'), rrx.text);

const hp = classifySurfaceIntent('이건 보류: 다음 분기로');
assert.ok(hp && hp.intent === 'hold_pause');
const hpx = await tryExecutiveSurfaceResponse('이건 보류: 다음 분기로');
assert.equal(hpx.response_type, 'hold_pause');
assert.ok(hpx.text.includes('보류'), hpx.text);

const dep = classifySurfaceIntent('배포 준비');
assert.ok(dep && dep.intent === 'request_deploy_readiness');
const depx = await tryExecutiveSurfaceResponse('배포 준비');
assert.equal(depx.response_type, 'request_deploy_readiness');

const pf = classifySurfaceIntent('피드백: 결제 버튼이 모바일에서 잘려요');
assert.ok(pf && pf.intent === 'product_feedback' && pf.body.includes('결제'), pf);
const pfx = await tryExecutiveSurfaceResponse('피드백: 결제 버튼이 모바일에서 잘려요');
assert.equal(pfx.response_type, 'product_feedback');
assert.ok(pfx.text.includes('인입') && pfx.text.includes('메타'), pfx.text);
const pfb = classifySurfaceIntent('제품 피드백: 온보딩 문구');
assert.ok(pfb && pfb.intent === 'product_feedback');
const fben = classifySurfaceIntent('feedback: login spinner');
assert.ok(fben && fben.intent === 'product_feedback' && fben.body.includes('spinner'), fben);

console.log('ok: surface intent fast-track');
