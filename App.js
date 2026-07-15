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
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CONFETTI_COLORS = ['#7C6BFF', '#34C77B', '#FF6B9D', '#FFC93C', '#4ECDC4', '#FF9F68'];
const isWeb = Platform.OS === 'web';

// 오늘의 목표를 위한 1회성 알람 예약 (기존 예약은 지우고 새로).
// 정한 시각이 이미 지났으면 다음 날 그 시각으로.
async function scheduleTaskAlarm(hour, minute, taskText) {
  if (isWeb) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = new Date();
  const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (when.getTime() <= now.getTime()) when.setDate(when.getDate() + 1);
  await Notifications.scheduleNotificationAsync({
    content: { title: '딱하나 🌱', body: `'${taskText}' 할 시간이야!` },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
}

async function cancelAlarms() {
  if (isWeb) return;
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (e) {}
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

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return keyOf(d);
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

  // 목표 정하기 흐름 상태
  const [mode, setMode] = useState('input'); // 'choose'(어제 목표 보여주기) | 'input'
  const [draft, setDraft] = useState('');
  const [wantAlarm, setWantAlarm] = useState(false);
  const [alarmTime, setAlarmTime] = useState({ hour: 21, minute: 0 });
  const [showPicker, setShowPicker] = useState(false);
  const [note, setNote] = useState('');

  const now = new Date();
  const tk = keyOf(now);
  const today = data[tk];
  const task = today ? today.task : '';
  const done = today ? today.done : false;
  const alarm = today ? today.alarm : null;
  const yTask = data[yesterdayKey()] ? data[yesterdayKey()].task : '';
  const streak = calcStreak(data);
  const { cells, year, month } = buildCells(now);
  const todayNum = now.getDate();

  const alarmDate = new Date();
  alarmDate.setHours(alarmTime.hour, alarmTime.minute, 0, 0);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setData(parsed);
          // 어제 목표가 있으면 선택 화면부터
          const yk = yesterdayKey();
          if (parsed[yk] && parsed[yk].task) setMode('choose');
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persist = async (next) => {
    setData(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  };

  // 어제 목표를 오늘도 → 입력창에 채워두고 알람도 이어받기
  const chooseSame = () => {
    setDraft(yTask);
    const ya = data[yesterdayKey()] ? data[yesterdayKey()].alarm : null;
    if (ya) { setWantAlarm(true); setAlarmTime({ hour: ya.hour, minute: ya.minute }); }
    setNote('');
    setMode('input');
  };
  const chooseNew = () => {
    setDraft('');
    setWantAlarm(false);
    setNote('');
    setMode('input');
  };

  const onPickerChange = (event, selected) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'set' && selected) {
      setAlarmTime({ hour: selected.getHours(), minute: selected.getMinutes() });
    }
  };

  const commit = async () => {
    const v = draft.trim();
    if (!v) return;
    setNote('');
    let savedAlarm = null;

    if (wantAlarm) {
      if (isWeb) {
        savedAlarm = { hour: alarmTime.hour, minute: alarmTime.minute };
        setNote('웹에선 미리보기만 — 실제 알람은 폰에서 울려요 🔔');
      } else {
        try {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
          if (status === 'granted') {
            await scheduleTaskAlarm(alarmTime.hour, alarmTime.minute, v);
            savedAlarm = { hour: alarmTime.hour, minute: alarmTime.minute };
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

    persist({ ...data, [tk]: { task: v, done: false, alarm: savedAlarm } });
    setDraft('');
    setWantAlarm(false);
  };

  const markDone = async () => {
    await cancelAlarms(); // 다 했으니 알람은 그만
    persist({ ...data, [tk]: { ...today, done: true } });
    setBurst((b) => b + 1);
  };

  const reset = async () => {
    await cancelAlarms();
    const next = { ...data };
    delete next[tk];
    await persist(next);
    setDraft('');
    setWantAlarm(false);
    setNote('');
    setMode(yTask ? 'choose' : 'input');
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

          <View style={styles.card}>
            {/* ── 상태 1a: 어제 목표 보여주고 선택 ── */}
            {!task && mode === 'choose' && yTask ? (
              <>
                <Text style={styles.label}>어제의 딱 하나</Text>
                <Text style={styles.taskText}>{yTask}</Text>
                <Pressable style={styles.btn} onPress={chooseSame}>
                  <Text style={styles.btnText}>오늘도 이걸로 하기</Text>
                </Pressable>
                <Pressable style={styles.ghost} onPress={chooseNew}>
                  <Text style={styles.ghostText}>새로운 목표 정하기</Text>
                </Pressable>
              </>
            ) : null}

            {/* ── 상태 1b: 목표 입력 + 상세 설정(알림) ── */}
            {!task && !(mode === 'choose' && yTask) ? (
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

                <Pressable style={styles.btn} onPress={commit}>
                  <Text style={styles.btnText}>이걸로 정하기</Text>
                </Pressable>

                {yTask ? (
                  <Pressable style={styles.ghost} onPress={() => setMode('choose')}>
                    <Text style={styles.ghostText}>← 어제 목표 다시 보기</Text>
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
                {alarm ? (
                  <Text style={styles.alarmInfo}>🔔 {fmtTime(alarm.hour, alarm.minute)}에 알려줄게요</Text>
                ) : null}
                <Pressable style={[styles.btn, styles.doneBtn]} onPress={markDone}>
                  <Text style={styles.btnText}>🎉 해냈다!</Text>
                </Pressable>
                <Pressable style={styles.ghost} onPress={reset}>
                  <Text style={styles.ghostText}>다른 걸로 바꾸기</Text>
                </Pressable>
              </>
            ) : null}

            {/* ── 상태 3: 해냄! ── */}
            {task && done ? (
              <>
                <Text style={styles.emoji}>🌟</Text>
                <Text style={styles.doneTitle}>오늘 해냈어!</Text>
                <Text style={styles.doneSub}>"{task}"{'\n'}딱 하나, 확실하게 끝냈어. 멋지다 👏</Text>
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

          {/* ── 캘린더 ── */}
          <View style={[styles.card, styles.calCard]}>
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
                return (
                  <View key={i} style={styles.calCell}>
                    <View style={[styles.calDay, isDone && styles.calDayDone, isToday && styles.calDayToday]}>
                      <Text style={[styles.calDayText, isDone && styles.calDayTextDone]}>
                        {isDone ? '✓' : day}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <Text style={styles.foot}>계획은 그만. 오늘 딱 하나만. 🌱</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      {burst > 0 && <Confetti key={burst} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FEF6F0' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 22, paddingVertical: 40 },
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
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

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

  foot: { marginTop: 26, fontSize: 13, color: '#a49dba', fontWeight: '600', textAlign: 'center' },
});
