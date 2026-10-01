import type { Study } from "../types";

export const studies: Study[] = [
  {
    id: 1,
    name: "대학생 일정 관리 앱",
    desc: "회원가입 온보딩 흐름 검증",
    version: "v2",
    status: "분석 완료",
    updated: "오늘, 오후 2:34",
    ai: 100,
    real: 15,
    tone: "complete",
  },
  {
    id: 2,
    name: "구독형 학습 플래너",
    desc: "가격 노출 시점과 전환 의향",
    version: "v1",
    status: "실제 조사 중",
    updated: "어제, 오후 5:12",
    ai: 100,
    real: 9,
    tone: "running",
  },
  {
    id: 3,
    name: "캠퍼스 중고거래",
    desc: "판매 등록 단계 이탈 분석",
    version: "v1",
    status: "설정 중",
    updated: "9월 18일",
    ai: 0,
    real: 0,
    tone: "draft",
  },
];

export const funnel: [string, number, number][] = [
  ["시작 화면", 100, 100],
  ["기본 정보", 92, 93],
  ["학교 입력", 68, 73],
  ["관심 분야", 49, 60],
  ["가입 완료", 39, 53],
];

export const reasons: [string, string, number, number][] = [
  ["입력 항목이 너무 많음", "TOO_MANY_STEPS", 41, 38],
  ["개인정보를 과하게 요구함", "PRIVACY", 27, 31],
  ["어디로 가야 할지 모름", "NAVIGATION_LOST", 18, 15],
];
