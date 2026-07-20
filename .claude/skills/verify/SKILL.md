---
name: verify
description: Run 딱하나 in the browser and drive its flows to verify a change end-to-end.
---

# 딱하나 검증 레시피

React Native (Expo SDK 54) 앱. **웹 빌드로 검증**하는 게 가장 빠르다 —
react-native-web으로 같은 App.js가 그대로 돌아가므로 UI/상태/저장 로직은
웹에서 전부 확인된다.

## 띄우기

```bash
npx expo start --web --port 8081     # 백그라운드로
# "Waiting on http://localhost:8081" 뜰 때까지 대기 (~20초)
```

끝나면 반드시 서버를 정리한다(TaskStop).

## ⚠️ 사용자 데이터 보호 — 반드시 지킬 것

AsyncStorage-web은 **접두사 없이** `localStorage['ddakhana_v1']`에 저장된다.
이건 실사용 데이터일 수 있다. 검증 전 스냅샷, 검증 후 복원:

```js
// 시작
window.__REAL_BACKUP__ = localStorage.getItem('ddakhana_v1');
// 끝
if (window.__REAL_BACKUP__ == null) localStorage.removeItem('ddakhana_v1');
else localStorage.setItem('ddakhana_v1', window.__REAL_BACKUP__);
```

(사용자는 주로 폰 Expo Go/독립앱을 쓰므로 웹 저장소는 보통 비어 있지만,
확인 없이 지우지 말 것.)

## 클릭하기

RN Web은 버튼이 `<div>`로 렌더된다. 텍스트로 찾아 마지막 요소를 클릭:

```js
(() => {
  const a = [...document.querySelectorAll('div')]
    .filter(e => e.textContent.trim() === '▶ 시작하기');
  a[a.length - 1].click();
  return 'clicked';
})()
```

- **IIFE로 감쌀 것** — puppeteer_evaluate는 같은 컨텍스트를 재사용해서
  `const els`를 두 번 선언하면 "already declared" 에러가 난다.
- 텍스트 입력은 `puppeteer_fill('input', ...)` — 화면에 input이 하나뿐일 때만.

## 상태 주입

날짜별 데이터 구조 (`YYYY-MM-DD` 키):

```js
{ task, done, alarm: {hour,minute}|null,
  session: { minutes, startedAt, plan },   // 집중 타이머
  result }                                  // 완료 후 한 줄 기록
```

주입 후 `puppeteer_navigate`로 리로드하면 그 상태부터 시작한다.

- **어제 목표 선택 화면**: 어제 키에 `{task}` 넣기
- **타이머 만료 상태**: `session.startedAt = Date.now() - minutes*60000 - 3000`
- **스트릭/캘린더**: 과거 날짜에 `{task, done:true}` 여러 개

## 몰아볼 흐름

1. 목표 입력 → 이걸로 정하기
2. ▶ 시작하기 → 계획/시간 칩 → ▶ N분 시작 → 카운트다운
3. 리로드해서 타이머가 이어지는지 (startedAt 기반이라 이어져야 함)
4. 만료 → 해냈다 / +10분 / 오늘은 여기까지
5. 해냈다 → 한 줄 기록 → 남기기·건너뛰기
6. 타이머 **없이** 바로 해냈다 (타이머는 선택 사항)

## 웹에서 검증 안 되는 것

- **실제 알림 발사** — `isWeb` 가드로 전부 no-op. 폰에서만 확인 가능.
- 네이티브 시간 피커(`@react-native-community/datetimepicker`) —
  웹은 `WebTimePicker` 스테퍼로 갈라진다.

## 알려진 무해한 경고

- `props.pointerEvents is deprecated` (RNW 내부)
- `Unexpected text node` — 입력 화면에서 간헐 발생, 기존부터 있던 것
- `useNativeDriver ... falling back to JS-based animation` — 컨페티, 웹에선 정상
