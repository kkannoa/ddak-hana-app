import { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, TextInput, Pressable, Switch,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
  Animated, Easing, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

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
const REMINDER_KEY = 'ddakhana_reminder_v1';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CONFETTI_COLORS = ['#7C6BFF', '#34C77B', '#FF6B9D', '#FFC93C', '#4ECDC4', '#FF9F68'];
// 알림 시간 프리셋 (고르는 부담을 줄이려고 몇 개만)
const REMINDER_TIMES = [
  { label: '아침 8시', hour: 8, minute: 0 },
  { label: '점심 1시', hour: 13, minute: 0 },
  { label: '저녁 7시', hour: 19, minute: 0 },
  { label: '밤 10시', hour: 22, minute: 0 },
];
const isWeb = Platform.OS === 'web';

// 매일 hour:minute에 반복되는 로컬 알림 예약 (기존 예약은 지우고 새로)
async function scheduleDaily(hour, minute) {
  if (isWeb) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: '딱하나 🌱', body: '오늘의 딱 하나, 정했어?' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
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

// Date → 'YYYY-MM-DD'
function keyOf(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const [data, setData] = useState({}); // { 'YYYY-MM-DD': { task, done } }
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [burst, setBurst] = useState(0); // 완료 순간에만 컨페티 발사
  const [reminder, setReminder] = useState({ enabled: false, hour: 22, minute: 0 });
  const [remindNote, setRemindNote] = useState('');

  const now = new Date();
  const tk = keyOf(now);
  const today = data[tk];
  const task = today ? today.task : '';
  const done = today ? today.done : false;
  const streak = calcStreak(data);
  const { cells, year, month } = buildCells(now);
  const todayNum = now.getDate();

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setData(JSON.parse(raw));
        const rem = await AsyncStorage.getItem(REMINDER_KEY);
        if (rem) setReminder(JSON.parse(rem));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persistReminder = async (next) => {
    setReminder(next);
    try { await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const toggleReminder = async () => {
    setRemindNote('');
    if (reminder.enabled) {
      if (!isWeb) { try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (e) {} }
      persistReminder({ ...reminder, enabled: false });
      return;
    }
    // 켜기: 권한 요청 → 예약
    if (!isWeb) {
      try {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        if (status !== 'granted') {
          setRemindNote('알림 권한을 허용해줘요 🙏 (폰 설정에서 켤 수 있어요)');
          return;
        }
        await scheduleDaily(reminder.hour, reminder.minute);
      } catch (e) {
        setRemindNote('알림을 못 켰어요. 폰에서 다시 시도해줘요');
        return;
      }
    } else {
      setRemindNote('웹에선 미리보기만 — 실제 알림은 폰에서 울려요 🔔');
    }
    persistReminder({ ...reminder, enabled: true });
  };

  const pickTime = async (t) => {
    const next = { ...reminder, hour: t.hour, minute: t.minute };
    if (reminder.enabled && !isWeb) {
      try { await scheduleDaily(t.hour, t.minute); } catch (e) {}
    }
    persistReminder(next);
  };

  const persist = async (next) => {
    setData(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    persist({ ...data, [tk]: { task: v, done: false } });
    setDraft('');
  };
  const markDone = () => {
    persist({ ...data, [tk]: { task, done: true } });
    setBurst((b) => b + 1);
  };
  const reset = () => {
    const next = { ...data };
    delete next[tk];
    persist(next);
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
            {/* ── 상태 1: 아직 안 정함 ── */}
            {!task && (
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
                  onSubmitEditing={commit}
                />
                <Pressable style={styles.btn} onPress={commit}>
                  <Text style={styles.btnText}>이걸로 정하기</Text>
                </Pressable>
              </>
            )}

            {/* ── 상태 2: 정했지만 아직 못함 ── */}
            {task && !done && (
              <>
                <Text style={styles.label}>오늘의 딱 하나</Text>
                <Text style={styles.taskText}>{task}</Text>
                <Pressable style={[styles.btn, styles.doneBtn]} onPress={markDone}>
                  <Text style={styles.btnText}>🎉 해냈다!</Text>
                </Pressable>
                <Pressable style={styles.ghost} onPress={reset}>
                  <Text style={styles.ghostText}>다른 걸로 바꾸기</Text>
                </Pressable>
              </>
            )}

            {/* ── 상태 3: 해냄! ── */}
            {task && done && (
              <>
                <Text style={styles.emoji}>🌟</Text>
                <Text style={styles.doneTitle}>오늘 해냈어!</Text>
                <Text style={styles.doneSub}>"{task}"{'\n'}딱 하나, 확실하게 끝냈어. 멋지다 👏</Text>
                <Pressable style={styles.ghost} onPress={reset}>
                  <Text style={styles.ghostText}>다른 걸로 바꾸기</Text>
                </Pressable>
              </>
            )}

            {/* ── 스트릭 ── */}
            {streak > 0 && (
              <View style={styles.streakRow}>
                <Text style={styles.fire}>🔥</Text>
                <Text style={styles.streakText}>
                  <Text style={styles.streakNum}>{streak}</Text>일 연속!
                </Text>
              </View>
            )}
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

          {/* ── 매일 알림 ── */}
          <View style={[styles.card, styles.remindCard]}>
            <View style={styles.remindHeader}>
              <View style={styles.flex}>
                <Text style={styles.remindTitle}>🔔 매일 알림</Text>
                <Text style={styles.remindSub}>
                  {reminder.enabled ? '이 시간에 살짝 알려줄게요' : '까먹지 않게 매일 한 번 알려줄까요?'}
                </Text>
              </View>
              <Switch
                value={reminder.enabled}
                onValueChange={toggleReminder}
                trackColor={{ false: '#E5E1F0', true: '#C4BBFF' }}
                thumbColor={reminder.enabled ? '#7C6BFF' : '#fff'}
              />
            </View>

            {reminder.enabled && (
              <View style={styles.timeRow}>
                {REMINDER_TIMES.map((t) => {
                  const active = t.hour === reminder.hour && t.minute === reminder.minute;
                  return (
                    <Pressable
                      key={t.label}
                      style={[styles.timeChip, active && styles.timeChipOn]}
                      onPress={() => pickTime(t)}
                    >
                      <Text style={[styles.timeChipText, active && styles.timeChipTextOn]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {remindNote ? <Text style={styles.remindNote}>{remindNote}</Text> : null}
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

  btn: {
    width: '100%', backgroundColor: '#7C6BFF', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 14,
  },
  doneBtn: { backgroundColor: '#34C77B', marginTop: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  ghost: { width: '100%', paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  ghostText: { color: '#8b83a3', fontSize: 15, fontWeight: '700' },

  emoji: { fontSize: 54, textAlign: 'center', marginBottom: 6 },
  doneTitle: { fontSize: 23, fontWeight: '900', color: '#2B2340', textAlign: 'center', marginBottom: 8 },
  doneSub: { fontSize: 15, color: '#6B6480', textAlign: 'center', lineHeight: 22 },

  // 알림
  remindCard: { marginTop: 16, padding: 22 },
  remindHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  remindTitle: { fontSize: 16, fontWeight: '800', color: '#2B2340' },
  remindSub: { fontSize: 13, color: '#8b83a3', marginTop: 3 },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#F3F0FF' },
  timeChipOn: { backgroundColor: '#7C6BFF' },
  timeChipText: { fontSize: 13, fontWeight: '700', color: '#6B6480' },
  timeChipTextOn: { color: '#fff' },
  remindNote: { fontSize: 12.5, color: '#a49dba', marginTop: 14, lineHeight: 18 },

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
