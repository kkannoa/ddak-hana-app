import { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, TextInput, Pressable,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
  Animated, Easing, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Updates from 'expo-updates';

// 앱이 열려 있을 때도 알림 배너가 뜨도록
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const STORAGE_KEY = 'ddakhana_v1';
// 목표 풀은 날짜별 기록과 따로 산다 — 기존 기록은 건드리지 않는다
const GOALS_KEY = 'ddakhana_goals_v1';
// 알림 종류가 둘(목표 알람 / 집중 타이머)이라 서로 안 지우게 ID를 나눠 쓴다
const ALARM_ID = 'ddakhana-task-alarm';
const TIMER_ID = 'ddakhana-timer';
const DURATIONS = [5, 10, 15, 30, 60];
const MAX_MINUTES = 600; // 10시간
// 화면 맨 아래에 표시 — 어떤 버전이 돌고 있는지 눈으로 바로 확인하려고
const BUILD_TAG = 'v2.1 · 하단 여백 수정 📐';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CONFETTI_COLORS = ['#7C6BFF', '#34C77B', '#FF6B9D', '#FFC93C', '#4ECDC4', '#FF9F68'];
const isWeb = Platform.OS === 'web';
// 안드로이드 하단 네비게이션 바(3버튼 48dp / 제스처 ~24dp)에 안 가리도록 넉넉히
const NAV_PAD = Platform.OS === 'android' ? 96 : 40;

// 오늘의 목표를 위한 1회성 알람 예약 (기존 예약은 지우고 새로).
// 정한 시각이 이미 지났으면 다음 날 그 시각으로.
async function scheduleTaskAlarm(hour, minute, taskText) {
  if (isWeb) return;
  await cancelOne(ALARM_ID);
  const now = new Date();
  const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (when.getTime() <= now.getTime()) when.setDate(when.getDate() + 1);
  await Notifications.scheduleNotificationAsync({
    identifier: ALARM_ID,
    content: { title: '딱하나 🌱', body: `'${taskText}' 할 시간이야!` },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
}

// 집중 타이머가 끝날 때 울릴 알림
async function scheduleTimerAlarm(minutes, taskText) {
  if (isWeb) return;
  await cancelOne(TIMER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: TIMER_ID,
    content: { title: '딱하나 🌱', body: `${fmtDur(minutes)} 끝! '${taskText}' 어땠어?` },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: minutes * 60,
    },
  });
}

async function cancelOne(id) {
  if (isWeb) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch (e) {}
}

async function cancelAlarms() {
  await cancelOne(ALARM_ID);
  await cancelOne(TIMER_ID);
}

// 분 → "45분" / "1시간" / "1시간 30분"
function fmtDur(m) {
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}시간 ${rest}분` : `${h}시간`;
}

// 남은 시간(ms) → "24:05", 1시간 넘으면 "1:29:56"
function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// hour(0-23), minute → "오전 9:05"
function fmtTime(hour, minute) {
  const ampm = hour < 12 ? '오전' : '오후';
  let h = hour % 12;
  if (h === 0) h = 12;
  return `${ampm} ${h}:${String(minute).padStart(2, '0')}`;
}

// 🎉 해냈을 때 위에서 쏟아지는 색종이 (네이티브 드라이버, 새 의존성 없음)
function Confetti({ count = 26 }) {
  const { width, height } = Dimensions.get('window');
  const pieces = useRef(
    Array.from({ length: count }, () => ({
      x: Math.random(),
      drift: (Math.random() - 0.5) * 140,
      spin: (Math.random() < 0.5 ? 1 : -1) * (360 + Math.random() * 360),
      size: 8 + Math.random() * 6,
      round: Math.random() < 0.35,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      anim: new Animated.Value(0),
      duration: 1500 + Math.random() * 900,
    }))
  ).current;

  useEffect(() => {
    Animated.stagger(
      18,
      pieces.map((p) =>
        Animated.timing(p.anim, {
          toValue: 1,
          duration: p.duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      )
    ).start();
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const translateY = p.anim.interpolate({ inputRange: [0, 1], outputRange: [-30, height * 0.85] });
        const translateX = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });
        const rotate = p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] });
        const opacity = p.anim.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x * width,
              top: 0,
              width: p.size,
              height: p.round ? p.size : p.size * 1.4,
              borderRadius: p.round ? p.size : 2,
              backgroundColor: p.color,
              transform: [{ translateX }, { translateY }, { rotate }],
              opacity,
            }}
          />
        );
      })}
    </View>
  );
}

// 웹 전용 간단 시간 스테퍼 (폰에선 네이티브 알람시계를 씀)
function WebTimePicker({ hour, minute, onChange }) {
  const bump = (dh, dm) => {
    const h = (hour + dh + 24) % 24;
    const m = (minute + dm + 60) % 60;
    onChange({ hour: h, minute: m });
  };
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return (
    <View style={styles.webPicker}>
      <Pressable style={styles.webAmpm} onPress={() => onChange({ hour: (hour + 12) % 24, minute })}>
        <Text style={styles.webAmpmText}>{hour < 12 ? '오전' : '오후'}</Text>
      </Pressable>
      <View style={styles.webCol}>
        <Pressable style={styles.webStep} onPress={() => bump(1, 0)}><Text style={styles.webStepText}>▲</Text></Pressable>
        <Text style={styles.webNum}>{String(h12).padStart(2, '0')}</Text>
        <Pressable style={styles.webStep} onPress={() => bump(-1, 0)}><Text style={styles.webStepText}>▼</Text></Pressable>
      </View>
      <Text style={styles.webColon}>:</Text>
      <View style={styles.webCol}>
        <Pressable style={styles.webStep} onPress={() => bump(0, 5)}><Text style={styles.webStepText}>▲</Text></Pressable>
        <Text style={styles.webNum}>{String(minute).padStart(2, '0')}</Text>
        <Pressable style={styles.webStep} onPress={() => bump(0, -5)}><Text style={styles.webStepText}>▼</Text></Pressable>
      </View>
    </View>
  );
}

// Date → 'YYYY-MM-DD'
function keyOf(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 풀을 처음 만들 때, 이미 쓰던 목표들을 옮겨온다.
// 안 그러면 업데이트하자마자 "내 목표 어디 갔지?"가 되니까.
function seedGoals(data) {
  const seen = new Set();
  const out = [];
  const d = new Date();
  for (let i = 0; i < 14 && out.length < 5; i++) {
    const rec = data[keyOf(d)];
    if (rec && rec.task && !seen.has(rec.task)) {
      seen.add(rec.task);
      out.push({
        id: newId(),
        text: rec.task,
        type: 'repeat',
        alarm: rec.alarm || null,
      });
    }
    d.setDate(d.getDate() - 1);
  }
  return out;
}

// 연속 달성 일수
function calcStreak(data) {
  let streak = 0;
  const d = new Date();
  // 오늘 아직 못했으면 어제부터 카운트 (오늘의 미완료가 스트릭을 깨지 않게)
  if (!(data[keyOf(d)] && data[keyOf(d)].done)) {
    d.setDate(d.getDate() - 1);
  }
  while (data[keyOf(d)] && data[keyOf(d)].done) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// 'YYYY-MM-DD' → "7월 15일 (화)"
function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = DOW[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${dow})`;
}

// 이번 달 캘린더 셀 배열 (앞쪽 빈칸 + 1~말일)
function buildCells(now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  return { cells, year, month };
}

export default function App() {
  const [data, setData] = useState({}); // { 'YYYY-MM-DD': { task, done, alarm } }
  const [loaded, setLoaded] = useState(false);
  const [burst, setBurst] = useState(0); // 완료 순간에만 컨페티 발사

  // 목표 풀 — 뒤에 쌓아두고, 오늘은 그중 하나만 꺼내 쓴다
  const [goals, setGoals] = useState([]);
  const [pickMode, setPickMode] = useState('list'); // 'list'(풀에서 고르기) | 'add'(새로 적기)
  const [tidy, setTidy] = useState(false); // 풀 정리(삭제) 모드
  const [newType, setNewType] = useState('repeat'); // 'repeat' | 'once'

  // 목표 정하기 흐름 상태
  const [draft, setDraft] = useState('');
  const [wantAlarm, setWantAlarm] = useState(false);
  const [alarmTime, setAlarmTime] = useState({ hour: 21, minute: 0 });
  const [showPicker, setShowPicker] = useState(false);
  const [note, setNote] = useState('');

  // 집중 세션(타이머) 상태
  const [sessionMode, setSessionMode] = useState('idle'); // 'idle' | 'setup'
  const [plan, setPlan] = useState('');
  const [pickMinutes, setPickMinutes] = useState(15);
  const [customOn, setCustomOn] = useState(false);
  const [customText, setCustomText] = useState('');
  const [resultDraft, setResultDraft] = useState('');
  const [, setTick] = useState(0); // 1초마다 리렌더용

  // 지난 기록 들여다보기 — 보기 전용, 고칠 수는 없다
  const [peekKey, setPeekKey] = useState(null);

  // 새 버전 알림 — 자동 적용 대신 사용자가 확인하고 받는다
  const [updateState, setUpdateState] = useState('idle'); // 'idle' | 'available' | 'downloading' | 'failed'

  const now = new Date();
  const tk = keyOf(now);
  const today = data[tk];
  const task = today ? today.task : '';
  const done = today ? today.done : false;
  const alarm = today ? today.alarm : null;
  const session = today ? today.session : null;
  const result = today ? today.result : undefined;
  const leftMs = session ? session.startedAt + session.minutes * 60000 - now.getTime() : 0;
  const running = !!session && leftMs > 0;
  const timeUp = !!session && leftMs <= 0;

  // 실제로 시작할 분 — 직접 입력 중이면 그 값(1~600분), 아니면 고른 칩
  const customMinutes = Math.min(parseInt(customText, 10) || 0, MAX_MINUTES);
  const startMinutes = customOn ? customMinutes : pickMinutes;
  const canStart = startMinutes >= 1;
  // 끝낸 일회성 목표는 풀에서 빠진다 (기록은 남기고 눈앞에서만 치운다)
  const pool = goals.filter((g) => !g.doneAt);
  const todayGoal = today && today.goalId ? goals.find((g) => g.id === today.goalId) : null;
  const streak = calcStreak(data);
  const { cells, year, month } = buildCells(now);
  const todayNum = now.getDate();

  // 들여다보는 중인 날 (해낸 날만 열린다)
  const peek = peekKey && data[peekKey] && data[peekKey].done ? data[peekKey] : null;
  // 이번 달에 ✓가 하나라도 있어야 안내 문구를 띄운다
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const hasDone = Object.keys(data).some((k) => k.startsWith(monthPrefix) && data[k].done);

  const alarmDate = new Date();
  alarmDate.setHours(alarmTime.hour, alarmTime.minute, 0, 0);

  useEffect(() => {
    (async () => {
      let parsed = {};
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          parsed = JSON.parse(raw);
          setData(parsed);
        }
      } catch (e) {}
      try {
        const rawGoals = await AsyncStorage.getItem(GOALS_KEY);
        if (rawGoals) {
          setGoals(JSON.parse(rawGoals));
        } else {
          // 첫 실행 — 쓰던 목표들을 풀로 옮기고 바로 저장해둔다
          const seeded = seedGoals(parsed);
          setGoals(seeded);
          await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(seeded));
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  // 앱 켤 때 새 버전이 있는지 조용히 확인만 (받지는 않음)
  useEffect(() => {
    if (isWeb || !Updates.isEnabled) return;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) setUpdateState('available');
      } catch (e) {} // 오프라인 등 — 조용히 넘어간다
    })();
  }, []);

  const applyUpdate = async () => {
    setUpdateState('downloading');
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // 여기서 앱이 새 버전으로 다시 시작
    } catch (e) {
      setUpdateState('failed');
    }
  };

  // 타이머가 도는 동안만 1초마다 리렌더 (끝나면 알아서 멈춤)
  useEffect(() => {
    if (!session || done || timeUp) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [session, done, timeUp]);

  const persist = async (next) => {
    setData(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const persistGoals = async (next) => {
    setGoals(next);
    try { await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const openAdd = () => {
    setDraft('');
    setNewType('repeat');
    setWantAlarm(false);
    setNote('');
    setTidy(false);
    setPickMode('add');
  };

  const deleteGoal = (id) => persistGoals(goals.filter((g) => g.id !== id));

  const onPickerChange = (event, selected) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'set' && selected) {
      setAlarmTime({ hour: selected.getHours(), minute: selected.getMinutes() });
    }
  };

  // 풀에서 하나를 꺼내 오늘의 딱 하나로 — 목표에 붙은 알람도 같이 예약된다
  const pickGoal = async (g) => {
    setNote('');
    let savedAlarm = null;

    if (g.alarm) {
      if (isWeb) {
        savedAlarm = g.alarm;
        setNote('웹에선 미리보기만 — 실제 알람은 폰에서 울려요 🔔');
      } else {
        try {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
          if (status === 'granted') {
            await scheduleTaskAlarm(g.alarm.hour, g.alarm.minute, g.text);
            savedAlarm = g.alarm;
          } else {
            setNote('알림 권한이 없어 목표만 저장했어요. 폰 설정에서 허용하면 다음엔 울려요 🙏');
          }
        } catch (e) {
          setNote('알람 예약에 실패했어요. 목표는 저장했어요.');
        }
      }
    } else {
      await cancelAlarms();
    }

    persist({ ...data, [tk]: { task: g.text, done: false, alarm: savedAlarm, goalId: g.id } });
    setPickMode('list');
    setTidy(false);
  };

  // 새 목표를 풀에 넣고 곧바로 오늘의 하나로 (적었다는 건 오늘 하고 싶다는 뜻)
  const addGoal = async () => {
    const v = draft.trim();
    if (!v) return;
    const g = {
      id: newId(),
      text: v,
      type: newType,
      alarm: wantAlarm ? { hour: alarmTime.hour, minute: alarmTime.minute } : null,
    };
    await persistGoals([g, ...goals]);
    setDraft('');
    setWantAlarm(false);
    await pickGoal(g);
  };

  // ── 집중 세션 ──
  const startSession = async () => {
    if (!canStart) return;
    await scheduleTimerAlarm(startMinutes, task);
    persist({
      ...data,
      [tk]: { ...today, session: { minutes: startMinutes, startedAt: Date.now(), plan: plan.trim() } },
    });
    setSessionMode('idle');
    setPlan('');
    setCustomOn(false);
    setCustomText('');
  };

  // 세션만 접기 — 목표와 기록은 그대로 (죄책감 금지)
  const stopSession = async () => {
    await cancelOne(TIMER_ID);
    const t = { ...today };
    delete t.session;
    persist({ ...data, [tk]: t });
  };

  const extendSession = async (mins) => {
    await scheduleTimerAlarm(mins, task);
    persist({
      ...data,
      [tk]: { ...today, session: { minutes: mins, startedAt: Date.now(), plan: session.plan } },
    });
  };

  const saveResult = async (text) => {
    await persist({ ...data, [tk]: { ...today, result: text } });
    setResultDraft('');
  };

  const markDone = async () => {
    await cancelAlarms(); // 다 했으니 알람은 그만
    // 일회성 목표는 여기서 풀을 떠난다 — 반복 목표는 그대로 남는다
    if (todayGoal && todayGoal.type === 'once') {
      await persistGoals(goals.map((g) => (g.id === todayGoal.id ? { ...g, doneAt: Date.now() } : g)));
    }
    persist({ ...data, [tk]: { ...today, done: true } });
    setBurst((b) => b + 1);
  };

  // 오늘의 선택만 무른다 — 목표 자체는 풀에 그대로 남는다
  const reset = async () => {
    await cancelAlarms();
    const next = { ...data };
    delete next[tk];
    await persist(next);
    setDraft('');
    setWantAlarm(false);
    setNote('');
    setSessionMode('idle');
    setPlan('');
    setResultDraft('');
    setPickMode('list');
    setTidy(false);
  };

  if (!loaded) return <View style={styles.safe} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>✺ 딱하나</Text>

          {/* 새 버전 안내 — 물어보고 받는다 */}
          {updateState !== 'idle' ? (
            <View style={styles.updCard}>
              <Text style={styles.updTitle}>
                {updateState === 'failed' ? '😅 못 받았어요' : '✨ 새 버전이 나왔어요'}
              </Text>
              <Text style={styles.updSub}>
                {updateState === 'failed'
                  ? '연결을 확인하고 다시 해볼래요?'
                  : '받으면 앱이 잠깐 다시 시작돼요'}
              </Text>
              <View style={styles.updRow}>
                <Pressable
                  style={[styles.updBtn, updateState === 'downloading' && styles.updBtnOff]}
                  onPress={applyUpdate}
                  disabled={updateState === 'downloading'}
                >
                  <Text style={styles.updBtnText}>
                    {updateState === 'downloading' ? '받는 중…' : updateState === 'failed' ? '다시 시도' : '업데이트'}
                  </Text>
                </Pressable>
                <Pressable style={styles.updLater} onPress={() => setUpdateState('idle')}>
                  <Text style={styles.updLaterText}>나중에</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            {/* ── 상태 1a: 목표 풀에서 오늘 하나 고르기 ── */}
            {!task && pickMode === 'list' && pool.length > 0 ? (
              <>
                <Text style={styles.prompt}>오늘, 딱 하나만 한다면{'\n'}뭐 할래?</Text>
                <View style={styles.poolList}>
                  {pool.map((g) => (
                    <View key={g.id} style={styles.poolRow}>
                      <Pressable style={styles.poolItem} onPress={() => pickGoal(g)} disabled={tidy}>
                        <Text style={styles.poolType}>{g.type === 'once' ? '🎯' : '🔁'}</Text>
                        <View style={styles.poolTextWrap}>
                          <Text style={styles.poolText}>{g.text}</Text>
                          {g.alarm ? (
                            <Text style={styles.poolAlarm}>🔔 {fmtTime(g.alarm.hour, g.alarm.minute)}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                      {tidy ? (
                        <Pressable style={styles.poolDel} onPress={() => deleteGoal(g.id)}>
                          <Text style={styles.poolDelText}>✕</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
                <Pressable style={styles.btn} onPress={openAdd}>
                  <Text style={styles.btnText}>+ 새 목표</Text>
                </Pressable>
                <Pressable style={styles.ghost} onPress={() => setTidy((v) => !v)}>
                  <Text style={styles.ghostText}>{tidy ? '정리 끝내기' : '목표 정리하기'}</Text>
                </Pressable>
                {note ? <Text style={styles.note}>{note}</Text> : null}
              </>
            ) : null}

            {/* ── 상태 1b: 새 목표 적기 (풀이 비었으면 여기가 첫 화면) ── */}
            {!task && !(pickMode === 'list' && pool.length > 0) ? (
              <>
                <Text style={styles.prompt}>오늘, 딱 하나만 한다면{'\n'}뭐 할래?</Text>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="예: 책 1페이지 / 방 2분 치우기"
                  placeholderTextColor="#b8b2c9"
                  maxLength={60}
                  returnKeyType="done"
                />

                {/* 반복이냐 한 번이냐 — 해냈을 때 풀에 남는지가 갈린다 */}
                <Text style={styles.sectionLabel}>이 목표는</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    style={[styles.chip, newType === 'repeat' && styles.chipOn]}
                    onPress={() => setNewType('repeat')}
                  >
                    <Text style={[styles.chipText, newType === 'repeat' && styles.chipTextOn]}>🔁 반복해서</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, newType === 'once' && styles.chipOn]}
                    onPress={() => setNewType('once')}
                  >
                    <Text style={[styles.chipText, newType === 'once' && styles.chipTextOn]}>🎯 딱 한 번만</Text>
                  </Pressable>
                </View>
                <Text style={styles.typeHint}>
                  {newType === 'repeat'
                    ? '해내도 풀에 남아서 언제든 다시 고를 수 있어요'
                    : '해내면 완료함으로 쏙 — 풀에서 사라져요'}
                </Text>

                {/* 상세 설정: 알림 */}
                <Pressable style={styles.checkRow} onPress={() => setWantAlarm((v) => !v)}>
                  <View style={[styles.checkbox, wantAlarm && styles.checkboxOn]}>
                    {wantAlarm ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.checkLabel}>정한 시간에 알림 받기 🔔</Text>
                </Pressable>

                {wantAlarm ? (
                  <View style={styles.pickerWrap}>
                    {isWeb ? (
                      <WebTimePicker hour={alarmTime.hour} minute={alarmTime.minute} onChange={setAlarmTime} />
                    ) : (
                      <>
                        <Pressable style={styles.timeBtn} onPress={() => setShowPicker(true)}>
                          <Text style={styles.timeBtnText}>⏰ {fmtTime(alarmTime.hour, alarmTime.minute)}</Text>
                          <Text style={styles.timeBtnEdit}>바꾸기</Text>
                        </Pressable>
                        {showPicker ? (
                          <DateTimePicker
                            value={alarmDate}
                            mode="time"
                            is24Hour={false}
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={onPickerChange}
                          />
                        ) : null}
                      </>
                    )}
                  </View>
                ) : null}

                <Pressable style={styles.btn} onPress={addGoal}>
                  <Text style={styles.btnText}>이걸로 정하기</Text>
                </Pressable>

                {pool.length > 0 ? (
                  <Pressable style={styles.ghost} onPress={() => setPickMode('list')}>
                    <Text style={styles.ghostText}>← 목표 풀에서 고르기</Text>
                  </Pressable>
                ) : null}

                {note ? <Text style={styles.note}>{note}</Text> : null}
              </>
            ) : null}

            {/* ── 상태 2: 정했지만 아직 못함 ── */}
            {task && !done ? (
              <>
                <Text style={styles.label}>오늘의 딱 하나</Text>
                <Text style={styles.taskText}>{task}</Text>
                {alarm && !session ? (
                  <Text style={styles.alarmInfo}>🔔 {fmtTime(alarm.hour, alarm.minute)}에 알려줄게요</Text>
                ) : null}

                {/* 2a: 시작 전 — 타이머는 선택, 바로 완료도 가능 */}
                {!session && sessionMode === 'idle' ? (
                  <>
                    <Pressable style={[styles.btn, styles.btnTop]} onPress={() => setSessionMode('setup')}>
                      <Text style={styles.btnText}>▶ 시작하기</Text>
                    </Pressable>
                    <Pressable style={[styles.btn, styles.doneBtn, styles.stack]} onPress={markDone}>
                      <Text style={styles.btnText}>🎉 해냈다!</Text>
                    </Pressable>
                    <Pressable style={styles.ghost} onPress={reset}>
                      <Text style={styles.ghostText}>다른 걸로 바꾸기</Text>
                    </Pressable>
                  </>
                ) : null}

                {/* 2b: 시작 설정 — 뭐 할지 + 얼마나 */}
                {!session && sessionMode === 'setup' ? (
                  <>
                    <Text style={styles.sectionLabel}>뭐 할 거야?</Text>
                    <TextInput
                      style={styles.input}
                      value={plan}
                      onChangeText={setPlan}
                      placeholder="예: 1장 끝까지 읽기"
                      placeholderTextColor="#b8b2c9"
                      maxLength={60}
                      returnKeyType="done"
                    />
                    <Text style={styles.sectionLabel}>얼마나?</Text>
                    <View style={styles.chipRow}>
                      {DURATIONS.map((m) => {
                        const on = !customOn && pickMinutes === m;
                        return (
                          <Pressable
                            key={m}
                            style={[styles.chip, on && styles.chipOn]}
                            onPress={() => { setCustomOn(false); setPickMinutes(m); }}
                          >
                            <Text style={[styles.chipText, on && styles.chipTextOn]}>{fmtDur(m)}</Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        style={[styles.chip, customOn && styles.chipOn]}
                        onPress={() => setCustomOn(true)}
                      >
                        <Text style={[styles.chipText, customOn && styles.chipTextOn]}>직접</Text>
                      </Pressable>
                    </View>

                    {customOn ? (
                      <View style={styles.customRow}>
                        <TextInput
                          style={styles.customInput}
                          value={customText}
                          onChangeText={(t) => setCustomText(t.replace(/[^0-9]/g, '').slice(0, 3))}
                          placeholder="45"
                          placeholderTextColor="#b8b2c9"
                          keyboardType="number-pad"
                          inputMode="numeric"
                          returnKeyType="done"
                        />
                        <Text style={styles.customUnit}>분</Text>
                      </View>
                    ) : null}

                    <Pressable
                      style={[styles.btn, !canStart && styles.btnOff]}
                      onPress={startSession}
                      disabled={!canStart}
                    >
                      <Text style={styles.btnText}>
                        {canStart ? `▶ ${fmtDur(startMinutes)} 시작` : '몇 분 할지 적어줘'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.ghost}
                      onPress={() => { setSessionMode('idle'); setPlan(''); setCustomOn(false); setCustomText(''); }}
                    >
                      <Text style={styles.ghostText}>취소</Text>
                    </Pressable>
                  </>
                ) : null}

                {/* 2c: 집중 중 */}
                {running ? (
                  <>
                    <Text style={[styles.timer, leftMs >= 3600000 && styles.timerLong]}>{fmtLeft(leftMs)}</Text>
                    {session.plan ? <Text style={styles.planText}>“{session.plan}”</Text> : null}
                    <Text style={styles.timerHint}>
                      {fmtDur(session.minutes)} 집중 중{isWeb ? '' : ' — 다 되면 알림이 울려요 🔔'}
                    </Text>
                    <Pressable style={[styles.btn, styles.doneBtn, styles.btnTop]} onPress={markDone}>
                      <Text style={styles.btnText}>🎉 해냈다!</Text>
                    </Pressable>
                    <Pressable style={styles.ghost} onPress={stopSession}>
                      <Text style={styles.ghostText}>그만두기</Text>
                    </Pressable>
                  </>
                ) : null}

                {/* 2d: 시간 다 됨 — 재촉 없이 고르게 */}
                {timeUp ? (
                  <>
                    <Text style={styles.timer}>00:00</Text>
                    <Text style={styles.timerHint}>{fmtDur(session.minutes)} 끝! 어땠어?</Text>
                    <Pressable style={[styles.btn, styles.doneBtn, styles.btnTop]} onPress={markDone}>
                      <Text style={styles.btnText}>🎉 해냈다!</Text>
                    </Pressable>
                    <Pressable style={[styles.btn, styles.stack]} onPress={() => extendSession(10)}>
                      <Text style={styles.btnText}>+10분 더 하기</Text>
                    </Pressable>
                    <Pressable style={styles.ghost} onPress={stopSession}>
                      <Text style={styles.ghostText}>오늘은 여기까지</Text>
                    </Pressable>
                  </>
                ) : null}
              </>
            ) : null}

            {/* ── 상태 3: 해냄! ── */}
            {task && done ? (
              <>
                <Text style={styles.emoji}>🌟</Text>
                <Text style={styles.doneTitle}>오늘 해냈어!</Text>
                <Text style={styles.doneSub}>"{task}"{'\n'}딱 하나, 확실하게 끝냈어. 멋지다 👏</Text>
                {todayGoal && todayGoal.type === 'once' ? (
                  <Text style={styles.onceDone}>🎯 완료함에 넣어뒀어요</Text>
                ) : null}

                {result === undefined ? (
                  <>
                    <Text style={styles.sectionLabel}>뭐 했는지 한 줄 남길래?</Text>
                    <TextInput
                      style={styles.input}
                      value={resultDraft}
                      onChangeText={setResultDraft}
                      placeholder="예: 3페이지나 읽었다"
                      placeholderTextColor="#b8b2c9"
                      maxLength={80}
                      returnKeyType="done"
                    />
                    <Pressable style={styles.btn} onPress={() => saveResult(resultDraft.trim())}>
                      <Text style={styles.btnText}>남기기</Text>
                    </Pressable>
                    <Pressable style={styles.ghost} onPress={() => saveResult('')}>
                      <Text style={styles.ghostText}>건너뛰기</Text>
                    </Pressable>
                  </>
                ) : null}

                {result !== undefined && (session || result) ? (
                  <View style={styles.logBox}>
                    {session && session.plan ? (
                      <Text style={styles.logLine}>📝 하려던 것 · {session.plan}</Text>
                    ) : null}
                    {result ? <Text style={styles.logLine}>✅ 실제로 · {result}</Text> : null}
                    {session ? <Text style={styles.logLine}>⏱ 집중 · {fmtDur(session.minutes)}</Text> : null}
                  </View>
                ) : null}

                <Pressable style={styles.ghost} onPress={reset}>
                  <Text style={styles.ghostText}>다른 걸로 바꾸기</Text>
                </Pressable>
              </>
            ) : null}

            {/* ── 스트릭 ── */}
            {streak > 0 ? (
              <View style={styles.streakRow}>
                <Text style={styles.fire}>🔥</Text>
                <Text style={styles.streakText}>
                  <Text style={styles.streakNum}>{streak}</Text>일 연속!
                </Text>
              </View>
            ) : null}
          </View>

          {/* ── 캘린더 / 지난 기록 (같은 자리에서 갈아끼움) ── */}
          <View style={[styles.card, styles.calCard]}>
            {peek ? (
              /* 지난 기록 — 보기 전용. 고치는 버튼은 일부러 없다 */
              <>
                <Text style={styles.calTitle}>{fmtDay(peekKey)}</Text>
                <Text style={styles.peekTask}>{peek.task}</Text>
                {peek.session || peek.result ? (
                  <View style={styles.logBox}>
                    {peek.session && peek.session.plan ? (
                      <Text style={styles.logLine}>📝 하려던 것 · {peek.session.plan}</Text>
                    ) : null}
                    {peek.result ? <Text style={styles.logLine}>✅ 실제로 · {peek.result}</Text> : null}
                    {peek.session ? (
                      <Text style={styles.logLine}>⏱ 집중 · {fmtDur(peek.session.minutes)}</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.peekPlain}>이날도 딱 하나, 해냈어요 🌱</Text>
                )}
                <Pressable style={styles.ghost} onPress={() => setPeekKey(null)}>
                  <Text style={styles.ghostText}>← 달력으로</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.calTitle}>{month + 1}월 기록</Text>
                <View style={styles.calGrid}>
                  {DOW.map((d) => (
                    <Text key={d} style={styles.calDow}>{d}</Text>
                  ))}
                  {cells.map((day, i) => {
                    if (day === null) return <View key={`e${i}`} style={styles.calCell} />;
                    const k = keyOf(new Date(year, month, day));
                    const isDone = data[k] && data[k].done;
                    const isToday = day === todayNum;
                    const cell = (
                      <View style={[styles.calDay, isDone && styles.calDayDone, isToday && styles.calDayToday]}>
                        <Text style={[styles.calDayText, isDone && styles.calDayTextDone]}>
                          {isDone ? '✓' : day}
                        </Text>
                      </View>
                    );
                    // 해낸 날만 열어본다 — 못한 날을 들춰봐야 좋을 게 없으니까
                    return isDone ? (
                      <Pressable key={i} style={styles.calCell} onPress={() => setPeekKey(k)}>
                        {cell}
                      </Pressable>
                    ) : (
                      <View key={i} style={styles.calCell}>{cell}</View>
                    );
                  })}
                </View>
                {hasDone ? (
                  <Text style={styles.calHint}>✓ 표시된 날을 누르면 그날 기록을 볼 수 있어요</Text>
                ) : null}
              </>
            )}
          </View>

          <Text style={styles.foot}>계획은 그만. 오늘 딱 하나만. 🌱</Text>
          <Text style={styles.buildTag}>{BUILD_TAG}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      {burst > 0 && <Confetti key={burst} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FEF6F0' },
  flex: { flex: 1 },
  // 안드로이드는 SafeAreaView가 아래쪽 인셋을 안 잡아줘서
  // 네비게이션 바에 맨 아래 줄(버전 표시)이 가린다 — 여유를 직접 준다
  scroll: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: 22, paddingTop: 40, paddingBottom: NAV_PAD,
  },
  brand: { fontSize: 20, fontWeight: '800', color: '#7C6BFF', marginBottom: 20, letterSpacing: -0.5 },

  card: {
    width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 26, padding: 28,
    shadowColor: '#503C78', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },

  prompt: { fontSize: 21, fontWeight: '800', color: '#2B2340', lineHeight: 30, marginBottom: 18 },
  input: {
    width: '100%', backgroundColor: '#F3F0FF', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15,
    fontSize: 17, color: '#2B2340', borderWidth: 2, borderColor: 'transparent',
  },

  label: { fontSize: 13, fontWeight: '700', color: '#6B6480', marginBottom: 10 },
  taskText: { fontSize: 25, fontWeight: '900', color: '#2B2340', lineHeight: 34, marginBottom: 22 },
  alarmInfo: { fontSize: 14, fontWeight: '700', color: '#7C6BFF', marginTop: -8, marginBottom: 20 },

  btn: {
    width: '100%', backgroundColor: '#7C6BFF', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 14,
  },
  doneBtn: { backgroundColor: '#34C77B', marginTop: 0 },
  btnTop: { marginTop: 0 },
  stack: { marginTop: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // 집중 타이머
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6B6480', marginTop: 18, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#F3F0FF', borderWidth: 2, borderColor: 'transparent',
  },
  chipOn: { backgroundColor: '#fff', borderColor: '#7C6BFF' },
  chipText: { fontSize: 15, fontWeight: '800', color: '#6B6480' },
  chipTextOn: { color: '#7C6BFF' },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  customInput: {
    flex: 1, backgroundColor: '#F3F0FF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 20, fontWeight: '800', color: '#2B2340', borderWidth: 2, borderColor: '#7C6BFF',
  },
  customUnit: { fontSize: 17, fontWeight: '800', color: '#6B6480' },
  btnOff: { backgroundColor: '#D9D2EC' },
  timer: {
    fontSize: 52, fontWeight: '900', color: '#7C6BFF', textAlign: 'center',
    letterSpacing: -1, marginBottom: 6, fontVariant: ['tabular-nums'],
  },
  timerLong: { fontSize: 42 },
  buildTag: { fontSize: 11, color: '#c9c2d8', marginTop: 6, fontWeight: '600' },

  // 새 버전 안내 배너
  updCard: {
    width: '100%', maxWidth: 420, backgroundColor: '#F3F0FF', borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 16, marginBottom: 14,
    borderWidth: 2, borderColor: '#DED6FF',
  },
  updTitle: { fontSize: 15, fontWeight: '800', color: '#2B2340' },
  updSub: { fontSize: 13, color: '#6B6480', marginTop: 3, fontWeight: '600' },
  updRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  updBtn: { backgroundColor: '#7C6BFF', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  updBtnOff: { backgroundColor: '#B7ACEC' },
  updBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  updLater: { paddingHorizontal: 12, paddingVertical: 10 },
  updLaterText: { color: '#8b83a3', fontSize: 14, fontWeight: '700' },
  planText: { fontSize: 16, fontWeight: '700', color: '#2B2340', textAlign: 'center', marginBottom: 6 },
  timerHint: { fontSize: 13, color: '#a49dba', textAlign: 'center', marginBottom: 20, fontWeight: '600' },

  logBox: { backgroundColor: '#F3F0FF', borderRadius: 14, padding: 16, marginTop: 20, gap: 6 },
  logLine: { fontSize: 14, color: '#2B2340', fontWeight: '600', lineHeight: 20 },

  // 목표 풀
  poolList: { gap: 8, marginBottom: 4 },
  poolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  poolItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F3F0FF', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15,
  },
  poolType: { fontSize: 17 },
  poolTextWrap: { flex: 1 },
  poolText: { fontSize: 16.5, fontWeight: '800', color: '#2B2340', lineHeight: 23 },
  poolAlarm: { fontSize: 12.5, fontWeight: '700', color: '#7C6BFF', marginTop: 3 },
  poolDel: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFECEF',
    alignItems: 'center', justifyContent: 'center',
  },
  poolDelText: { fontSize: 15, fontWeight: '900', color: '#FF6B9D' },
  typeHint: { fontSize: 12.5, color: '#a49dba', fontWeight: '600', marginTop: 8, lineHeight: 18 },
  onceDone: { fontSize: 13.5, fontWeight: '700', color: '#7C6BFF', textAlign: 'center', marginTop: 12 },

  ghost: { width: '100%', paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  ghostText: { color: '#8b83a3', fontSize: 15, fontWeight: '700' },

  // 상세 설정: 알림 체크 + 시간
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#D9D2EC',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#7C6BFF', borderColor: '#7C6BFF' },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '900' },
  checkLabel: { fontSize: 15, fontWeight: '700', color: '#2B2340' },

  pickerWrap: { marginTop: 14, alignItems: 'center' },
  timeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', backgroundColor: '#F3F0FF', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14,
  },
  timeBtnText: { fontSize: 18, fontWeight: '800', color: '#2B2340' },
  timeBtnEdit: { fontSize: 14, fontWeight: '700', color: '#7C6BFF' },

  // 웹 스테퍼
  webPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#F3F0FF', borderRadius: 14, paddingVertical: 14, width: '100%',
  },
  webAmpm: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 4 },
  webAmpmText: { fontSize: 14, fontWeight: '800', color: '#7C6BFF' },
  webCol: { alignItems: 'center', gap: 2 },
  webStep: { paddingHorizontal: 10, paddingVertical: 2 },
  webStepText: { fontSize: 14, color: '#7C6BFF', fontWeight: '900' },
  webNum: { fontSize: 24, fontWeight: '900', color: '#2B2340', minWidth: 34, textAlign: 'center' },
  webColon: { fontSize: 24, fontWeight: '900', color: '#2B2340' },

  note: { fontSize: 12.5, color: '#a49dba', marginTop: 14, lineHeight: 18, textAlign: 'center' },

  emoji: { fontSize: 54, textAlign: 'center', marginBottom: 6 },
  doneTitle: { fontSize: 23, fontWeight: '900', color: '#2B2340', textAlign: 'center', marginBottom: 8 },
  doneSub: { fontSize: 15, color: '#6B6480', textAlign: 'center', lineHeight: 22 },

  // 스트릭
  streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22 },
  fire: { fontSize: 22 },
  streakText: { fontSize: 15, fontWeight: '700', color: '#2B2340' },
  streakNum: { fontSize: 20, fontWeight: '900', color: '#7C6BFF' },

  // 캘린더
  calCard: { marginTop: 16, padding: 22 },
  calTitle: { fontSize: 14, fontWeight: '700', color: '#6B6480', marginBottom: 12 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDow: { width: '14.28%', textAlign: 'center', fontSize: 11, color: '#a49dba', fontWeight: '600', marginBottom: 6 },
  calCell: { width: '14.28%', aspectRatio: 1, padding: 3 },
  calDay: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calDayDone: { backgroundColor: '#7C6BFF' },
  calDayToday: { borderWidth: 2, borderColor: '#7C6BFF' },
  calDayText: { fontSize: 12, color: '#6B6480' },
  calDayTextDone: { color: '#fff', fontWeight: '800' },
  calHint: { fontSize: 12, color: '#a49dba', fontWeight: '600', textAlign: 'center', marginTop: 12 },

  // 지난 기록 (읽기 전용)
  peekTask: { fontSize: 20, fontWeight: '900', color: '#2B2340', lineHeight: 28, marginTop: 2 },
  peekPlain: { fontSize: 14, color: '#6B6480', fontWeight: '600', marginTop: 14 },

  foot: { marginTop: 26, fontSize: 13, color: '#a49dba', fontWeight: '600', textAlign: 'center' },
});
