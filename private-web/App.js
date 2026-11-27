import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  KeyboardAvoidingView,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, initializeAuth, signInAnonymously } from 'firebase/auth';
import * as Device from 'expo-device';
import {
  Timestamp,
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import LottieView from 'lottie-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeActivationReset } from './src/activationDevBus';
import Constants from 'expo-constants';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AddUserScreen from './src/screens/AddUserScreen';
import UserDetailsScreen from './src/screens/UserDetailsScreen';
import CardsScreen from './src/screens/CardsScreen';
import {
  ACTIVATION_CODES_COLLECTION,
  ACTIVATION_CONFIG_DOC,
  APP_VARIANT,
  DEVICES_COLLECTION,
  FIREBASE_CONFIG,
} from './src/config';

const Stack = createNativeStackNavigator();
let cachedFirestore = null;
let cachedAuth = null;
const OWNER_NAME_KEY = '@generator_owner_name';
const OWNER_PHONE_KEY = '@generator_owner_phone';
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_LOCK_MINUTES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function isFirebaseConfigured() {
  return Boolean(FIREBASE_CONFIG?.apiKey && FIREBASE_CONFIG?.projectId && FIREBASE_CONFIG?.appId);
}

function getFirebaseApp() {
  const apps = getApps();
  if (apps.length > 0) return apps[0];
  return initializeApp(FIREBASE_CONFIG);
}

function getFirebaseAuth(app) {
  if (cachedAuth) return cachedAuth;
  try {
    cachedAuth = initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

async function saveOwnerNameLocally(ownerName) {
  try {
    const v = String(ownerName || '').trim();
    if (!v) return;
    await AsyncStorage.setItem(OWNER_NAME_KEY, v);
  } catch {}
}

async function saveOwnerPhoneLocally(ownerPhone) {
  try {
    const v = String(ownerPhone || '').trim();
    if (!v) return;
    await AsyncStorage.setItem(OWNER_PHONE_KEY, v);
  } catch {}
}

function getFirebaseFirestore(app) {
  if (cachedFirestore) return cachedFirestore;
  try {
    cachedFirestore = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
    });
  } catch {
    cachedFirestore = getFirestore(app);
  }
  return cachedFirestore;
}

function formatFirebaseError(e) {
  const code = typeof e?.code === 'string' ? e.code : '';
  const name = typeof e?.name === 'string' ? e.name : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  const stack = typeof e?.stack === 'string' ? e.stack : '';

  let extra = '';
  try {
    const json = JSON.stringify(
      e,
      (k, v) => {
        if (k === 'stack') return undefined;
        return v;
      },
      2
    );
    if (json && json !== '{}' && json !== 'null') extra = json;
  } catch {}

  const parts = [];
  const head = [code, name].filter(Boolean).join(' ');
  if (head) parts.push(head);
  if (message) parts.push(message);
  if (extra && extra !== message) parts.push(extra);
  if (stack) parts.push(stack);
  return parts.join('\n');
}

function firebaseHelpForError(e) {
  const code = typeof e?.code === 'string' ? e.code : '';
  const msg = typeof e?.message === 'string' ? e.message : '';
  const text = `${code}\n${msg}`.toLowerCase();

  if (text.includes('permission-denied')) {
    return (
      'السبب غالباً من Rules في Firestore.\n' +
      'افتح Firestore → Rules وتأكد أن القراءة/الكتابة مسموحة للمستخدم المجهول (request.auth != null).'
    );
  }

  if (text.includes('auth/operation-not-allowed') || text.includes('operation-not-allowed')) {
    return 'السبب: Anonymous غير مفعّل في Authentication أو لم يتم الحفظ. تأكد أنه Enabled ثم Save.';
  }

  if (text.includes('failed-precondition')) {
    return 'السبب غالباً: Firestore غير مفعّل (لم يتم إنشاء Database) أو يوجد إعداد ناقص.';
  }

  if (text.includes('unavailable') || text.includes('network') || text.includes('timeout')) {
    return 'السبب غالباً: مشكلة اتصال/شبكة. جرّب تبديل الشبكة أو إيقاف VPN أو إعادة المحاولة.';
  }

  if (text.includes('invalid-argument') || text.includes('app/no-options')) {
    return 'السبب غالباً: إعدادات Firebase غير صحيحة في src/config.js.';
  }

  return '';
}

async function ensureSignedIn(app) {
  const auth = getFirebaseAuth(app);
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

function readBool(data, field, fallback = false) {
  const v = data?.[field];
  return typeof v === 'boolean' ? v : fallback;
}

function readInt(data, field, fallback = 0) {
  const v = data?.[field];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function readString(data, field, fallback = '') {
  const v = data?.[field];
  return typeof v === 'string' ? v : fallback;
}

function readTimestampMs(data, field) {
  const v = data?.[field];
  if (!v) return null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return null;
}

async function firestoreGetDoc(docPath) {
  const app = getFirebaseApp();
  await ensureSignedIn(app);
  const db = getFirebaseFirestore(app);
  const snap = await getDoc(doc(db, docPath));
  return snap.exists() ? snap.data() : null;
}

function normalizeWriteValue(value) {
  if (value && typeof value === 'object' && value.__timestampMs) {
    return Timestamp.fromMillis(value.__timestampMs);
  }
  return value;
}

async function firestorePatchDoc(docPath, fieldsObj, updateMaskFields) {
  const app = getFirebaseApp();
  await ensureSignedIn(app);
  const db = getFirebaseFirestore(app);

  const toWrite = {};
  for (const f of updateMaskFields) {
    toWrite[f] = normalizeWriteValue(fieldsObj[f]);
  }

  await setDoc(doc(db, docPath), toWrite, { merge: true });
  return true;
}

async function getStableDeviceId() {
  if (Platform.OS === 'android') {
    const id = Application.androidId;
    if (id) return `android:${id}`;
  }

  if (Platform.OS === 'ios') {
    const id = await Application.getIosIdForVendorAsync();
    if (id) return `ios:${id}`;
  }

  const fallback = Application.applicationId || 'unknown';
  return `${Platform.OS}:${fallback}`;
}

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function MainNavigator() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
        initialRouteName="Home"
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'أمبيرك' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'الإعدادات' }} />
        <Stack.Screen name="AddUser" component={AddUserScreen} options={{ title: 'إضافة مشترك جديد' }} />
        <Stack.Screen name="UserDetails" component={UserDetailsScreen} options={{ title: 'تفاصيل المشترك' }} />
        <Stack.Screen name="Cards" component={CardsScreen} options={{ title: 'إدارة بطاقات التفعيل' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function ActivationScreen({
  deviceId,
  attempts,
  maxAttempts,
  lockedUntilMs,
  onSubmit,
  isSubmitting,
  error,
}) {
  const [code, setCode] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (!lockedUntilMs) return;
    const t = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockedUntilMs]);

  const isLocked = lockedUntilMs ? lockedUntilMs > nowMs : false;
  const lockExpired = Boolean(lockedUntilMs) && lockedUntilMs <= nowMs;
  const effectiveAttempts = lockExpired ? 0 : attempts;
  const remaining = Math.max(0, maxAttempts - effectiveAttempts);
  const remainingLockMs = lockedUntilMs ? lockedUntilMs - nowMs : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={{ flex: 1 }}
      >
        <View style={styles.activationContainer}>
        <Text style={styles.activationTitle}>تفعيل التطبيق</Text>
        <Text style={styles.activationSubtitle}>
          أدخل كود التفعيل لإكمال الدخول
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>كود التفعيل</Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(String(t || '').replace(/\s+/g, '').toUpperCase())}
            placeholder="••••••"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
            textAlign="center"
            editable={!isSubmitting && !isLocked}
            returnKeyType="done"
            onSubmitEditing={() => onSubmit(code)}
          />

          <View style={styles.row}>
            <Text style={styles.metaText}>المحاولات المتبقية: {remaining}</Text>
          </View>

          {isLocked ? (
            <View style={styles.lockBox}>
              <Text style={styles.lockText}>تم إيقاف المحاولات مؤقتاً</Text>
              <Text style={styles.lockTextSecondary}>
                حاول بعد: {formatDurationMs(remainingLockMs)}
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => onSubmit(code)}
            disabled={isSubmitting || isLocked || !code.trim()}
            style={[
              styles.activateButton,
              isSubmitting || isLocked || !code.trim() ? styles.activateButtonDisabled : null,
            ]}
          >
            <Text style={styles.activateButtonText}>
              {isSubmitting ? '...' : 'تفعيل'}
            </Text>
          </Pressable>

          {APP_VARIANT === 'dev' ? (
            <Text style={styles.deviceText} numberOfLines={1}>
              Device ID: {deviceId}
            </Text>
          ) : null}
        </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OwnerInfoScreen({ name: initialName, phone: initialPhone, isSubmitting, error, onSubmit }) {
  const [name, setName] = useState(initialName || '');
  const [phone, setPhone] = useState(initialPhone || '');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.activationContainer}>
        <Text style={styles.activationTitle}>بيانات صاحب المولدة</Text>
        <Text style={styles.activationSubtitle}>
          أدخل الاسم الرباعي ورقم الهاتف قبل التفعيل
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>الاسم الرباعي</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="مثال: أحمد محمد علي حسين"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            keyboardType="default"
            textAlign="right"
            editable={!isSubmitting}
            returnKeyType="next"
            onSubmitEditing={() => {}}
          />

          <Text style={styles.label}>رقم الهاتف</Text>
          <TextInput
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
            placeholder="مثال: 07701234567"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            maxLength={11}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            textAlign="right"
            editable={!isSubmitting}
            returnKeyType="done"
            onSubmitEditing={() => onSubmit(name, phone)}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => onSubmit(name, phone)}
            disabled={isSubmitting || !name.trim() || !phone.trim()}
            style={[
              styles.activateButton,
              isSubmitting || !name.trim() || !phone.trim() ? styles.activateButtonDisabled : null,
            ]}
          >
            <Text style={styles.activateButtonText}>
              {isSubmitting ? '...' : 'متابعة'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ActivationGate() {
  const [ready, setReady] = useState(false);
  const [activated, setActivated] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS);
  const [lockMinutes, setLockMinutes] = useState(DEFAULT_LOCK_MINUTES);
  const [lockedUntilMs, setLockedUntilMs] = useState(null);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!isFirebaseConfigured()) {
          if (!mounted) return;
          setError('أدخل apiKey و projectId في src/config.js أولاً.');
          setReady(true);
          return;
        }

        const id = await getStableDeviceId();
        if (!mounted) return;
        setDeviceId(id);

        const cfgDocPath = `${ACTIVATION_CONFIG_DOC.collection}/${ACTIVATION_CONFIG_DOC.doc}`;
        const deviceDocPath = `${DEVICES_COLLECTION}/${id}`;

        const [cfgDoc, deviceDoc] = await Promise.all([
          firestoreGetDoc(cfgDocPath),
          firestoreGetDoc(deviceDocPath),
        ]);

        if (cfgDoc) {
          const ma = readInt(cfgDoc, 'maxAttempts', DEFAULT_MAX_ATTEMPTS);
          const lm = readInt(cfgDoc, 'lockMinutes', DEFAULT_LOCK_MINUTES);
          setMaxAttempts(Math.max(DEFAULT_MAX_ATTEMPTS, ma > 0 ? ma : DEFAULT_MAX_ATTEMPTS));
          setLockMinutes(lm > 0 ? lm : DEFAULT_LOCK_MINUTES);
        }

        if (deviceDoc) {
          const deviceData = deviceDoc || {};
          const expiresAtMs = readTimestampMs(deviceData, 'expiresAt');
          const expired = expiresAtMs != null && expiresAtMs <= Date.now();

          const lockUntilMs = readTimestampMs(deviceData, 'lockUntil');
          const lockExpired = lockUntilMs != null && lockUntilMs <= Date.now();

          setActivated(readBool(deviceData, 'activated', false) && !expired);
          setAttempts(lockExpired ? 0 : readInt(deviceData, 'attempts', 0));
          setLockedUntilMs(lockExpired ? null : lockUntilMs);
          setOwnerName(readString(deviceData, 'ownerName', ''));
          setOwnerPhone(readString(deviceData, 'ownerPhone', ''));
          setActivationCode(readString(deviceData, 'activationCode', ''));

          if (lockExpired) {
            firestorePatchDoc(
              deviceDocPath,
              { attempts: 0, lockUntil: null, lastSeenAt: serverTimestamp() },
              ['attempts', 'lockUntil', 'lastSeenAt']
            ).catch(() => {});
          }

          if (expired) {
            setError('انتهى الاشتراك. الرجاء إدخال كود تفعيل جديد.');
          }
        } else {
          setActivated(false);
          setAttempts(0);
          setLockedUntilMs(null);
          setOwnerName('');
          setOwnerPhone('');
          setActivationCode('');
        }

        setReady(true);
      } catch (e) {
        if (!mounted) return;
        const details = formatFirebaseError(e);
        const help = firebaseHelpForError(e);
        setError(
          `تعذر الاتصال بـ Firebase.\n` +
            (help ? `${help}\n\n` : 'تأكد من: تفعيل Anonymous في Authentication + السماح في Rules.\n\n') +
            (details || '')
        );
        setReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [reloadKey]);


  const devResetToActivation = async () => {
    try {
      const app = getFirebaseApp();
      const deviceDocPath = `${DEVICES_COLLECTION}/${deviceId}`;
      await firestorePatchDoc(
        deviceDocPath,
        {
          activated: false,
          attempts: 0,
          lockUntil: null,
          activationCode: null,
          ownerName: null,
          ownerPhone: null,
          lastSeenAt: serverTimestamp(),
        },
        ['activated', 'attempts', 'lockUntil', 'activationCode', 'ownerName', 'ownerPhone', 'lastSeenAt']
      );
    } catch {}

    try {
      await AsyncStorage.removeItem(OWNER_NAME_KEY);
      await AsyncStorage.removeItem(OWNER_PHONE_KEY);
    } catch {}

    setActivated(false);
    setOwnerName('');
    setOwnerPhone('');
    setActivationCode('');
    setAttempts(0);
    setLockedUntilMs(null);
    setError('');
    setReady(true);
    setReloadKey((v) => v + 1);
  };

  useEffect(() => {
    if (APP_VARIANT !== 'dev') return;
    return subscribeActivationReset(() => {
      devResetToActivation();
    });
  }, [devResetToActivation]);

  const submit = async (code) => {
    if (!deviceId) return;
    setIsSubmitting(true);
    setError('');

    try {
      const trimmed = String(code || '').trim();
      if (!trimmed) {
        setError('أدخل كود التفعيل.');
        return;
      }

      const codeUpper = trimmed.toUpperCase();
      const app = getFirebaseApp();
      await ensureSignedIn(app);
      const db = getFirebaseFirestore(app);

      const result = await runTransaction(db, async (tx) => {
        const now = Date.now();

        const cfgRef = doc(db, ACTIVATION_CONFIG_DOC.collection, ACTIVATION_CONFIG_DOC.doc);
        const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);
        const codeRef = doc(db, ACTIVATION_CODES_COLLECTION, codeUpper);

        const [cfgSnap, deviceSnap, codeSnap] = await Promise.all([
          tx.get(cfgRef),
          tx.get(deviceRef),
          tx.get(codeRef),
        ]);

        const cfg = cfgSnap.exists() ? cfgSnap.data() || {} : {};
        const max = Math.max(DEFAULT_MAX_ATTEMPTS, readInt(cfg, 'maxAttempts', maxAttempts) || maxAttempts);
        const lockMins = readInt(cfg, 'lockMinutes', lockMinutes) || lockMinutes;
        const lockMs = lockMins * 60 * 1000;

        const deviceData = deviceSnap.exists() ? deviceSnap.data() || {} : {};
        let currentAttempts = readInt(deviceData, 'attempts', 0);
        let currentLockUntilMs = readTimestampMs(deviceData, 'lockUntil');

        // انتهت مدة القفل: تُصفّر المحاولات ولا تُحسب المحاولات القديمة.
        if (currentLockUntilMs && currentLockUntilMs <= now) {
          currentAttempts = 0;
          currentLockUntilMs = null;
        }

        if (currentLockUntilMs && currentLockUntilMs > now) {
          tx.set(deviceRef, { lastSeenAt: serverTimestamp() }, { merge: true });
          return {
            status: 'locked',
            attempts: currentAttempts,
            maxAttempts: max,
            lockMinutes: lockMins,
            lockedUntilMs: currentLockUntilMs,
          };
        }

        if (!codeSnap.exists()) {
          const nextAttempts = currentAttempts + 1;
          const nextLockedUntilMs = nextAttempts >= max ? now + lockMs : null;
          tx.set(
            deviceRef,
            {
              activated: false,
              attempts: nextAttempts,
              lockUntil: nextLockedUntilMs ? Timestamp.fromMillis(nextLockedUntilMs) : null,
              lastAttemptAt: serverTimestamp(),
              lastSeenAt: serverTimestamp(),
            },
            { merge: true }
          );
          return {
            status: 'not_found',
            attempts: nextAttempts,
            maxAttempts: max,
            lockMinutes: lockMins,
            lockedUntilMs: nextLockedUntilMs,
          };
        }

        const codeData = codeSnap.data() || {};
        const codeUsed = readBool(codeData, 'isUsed', readBool(codeData, 'used', false));
        const ownerFromCode = readString(codeData, 'ownerName', '');
        const codeExpiresAtMs = readTimestampMs(codeData, 'expiresAt');
        const validMonths = Number(codeData.validMonths || 0);
        const durationDays = Number(codeData.durationDays || 0);
        const borrowNextDay = readBool(deviceData, 'borrowNextDay', false);

        // المدة تُحسب من لحظة التفعيل، لا من تاريخ توليد الكود.
        const subscriptionDays =
          durationDays > 0 ? durationDays : validMonths > 0 ? validMonths * 30 : 0;

        if (!codeUsed) {
          tx.set(
            codeRef,
            { isUsed: true, deviceId, usedAt: serverTimestamp() },
            { merge: true }
          );

          let finalExpiresAtMs = subscriptionDays > 0
            ? now + subscriptionDays * DAY_MS
            : codeExpiresAtMs;

          if (finalExpiresAtMs != null && borrowNextDay) {
            finalExpiresAtMs -= DAY_MS;
          }

          const updateData = {
            activated: true,
            attempts: 0,
            lockUntil: null,
            activationCode: codeUpper,
            validMonths: validMonths > 0 ? validMonths : null,
            ownerName: ownerName || ownerFromCode || null,
            ownerPhone: ownerPhone || null,
            activatedAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
          };

          if (finalExpiresAtMs != null) {
            updateData.expiresAt = Timestamp.fromMillis(finalExpiresAtMs);
          }

          if (borrowNextDay) {
            updateData.borrowNextDay = false;
          }

          tx.set(deviceRef, updateData, { merge: true });
          return {
            status: 'activated',
            attempts: 0,
            maxAttempts: max,
            lockMinutes: lockMins,
            lockedUntilMs: null,
            ownerName: ownerFromCode,
            activationCode: codeUpper,
          };
        }

        const nextAttempts = currentAttempts + 1;
        const nextLockedUntilMs = nextAttempts >= max ? now + lockMs : null;
        tx.set(
          deviceRef,
          {
            activated: false,
            attempts: nextAttempts,
            lockUntil: nextLockedUntilMs ? Timestamp.fromMillis(nextLockedUntilMs) : null,
            lastAttemptAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
          },
          { merge: true }
        );
        return {
          status: 'used',
          attempts: nextAttempts,
          maxAttempts: max,
          lockMinutes: lockMins,
          lockedUntilMs: nextLockedUntilMs,
        };
      });

      setMaxAttempts(result.maxAttempts ?? maxAttempts);
      setLockMinutes(result.lockMinutes ?? lockMinutes);
      setAttempts(result.attempts ?? attempts);
      setLockedUntilMs(result.lockedUntilMs ?? null);

      if (result.status === 'locked') {
        setError('تم قفل المحاولات مؤقتاً.');
        return;
      }

      if (result.status === 'activated') {
        setActivated(true);
        setOwnerName(result.ownerName || ownerName);
        setOwnerPhone(ownerPhone);
        setActivationCode(result.activationCode || '');
        await saveOwnerNameLocally(result.ownerName || ownerName);
        await saveOwnerPhoneLocally(ownerPhone);
        setError('');
        return;
      }

      if (result.lockedUntilMs) {
        setError(`تم قفل المحاولات لمدة ${result.lockMinutes ?? lockMinutes} دقائق.`);
        return;
      }

      if (result.status === 'not_found') {
        setError(`الكود غير موجود. المحاولات المتبقية: ${Math.max(0, (result.maxAttempts ?? maxAttempts) - (result.attempts ?? 0))}`);
        return;
      }

      if (result.status === 'used') {
        setError(`هذا الكود مستخدم. المحاولات المتبقية: ${Math.max(0, (result.maxAttempts ?? maxAttempts) - (result.attempts ?? 0))}`);
        return;
      }
    } catch (e) {
      const details = formatFirebaseError(e);
      const help = firebaseHelpForError(e);
      setError(`فشل التفعيل.\n${help ? `\n${help}\n` : '\n'}\n${details || ''}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitOwnerInfo = async (name, phone) => {
    if (!deviceId) return;
    setIsSubmitting(true);
    setError('');

    try {
      const trimmedName = String(name || '').trim();
      const trimmedPhone = String(phone || '').trim();
      if (!trimmedName) {
        setError('أدخل الاسم الرباعي.');
        return;
      }
      if (!trimmedPhone) {
        setError('أدخل رقم الهاتف.');
        return;
      }
      if (trimmedPhone.length !== 11) {
        setError('رقم الهاتف يجب أن يتكون من 11 رقم بالضبط.');
        return;
      }

      await saveOwnerNameLocally(trimmedName);
      await saveOwnerPhoneLocally(trimmedPhone);
      setOwnerName(trimmedName);
      setOwnerPhone(trimmedPhone);
      setError('');

      const deviceDocPath = `${DEVICES_COLLECTION}/${deviceId}`;
      firestorePatchDoc(
        deviceDocPath,
        { ownerName: trimmedName, ownerPhone: trimmedPhone, ownerNameUpdatedAt: new Date(), lastSeenAt: new Date() },
        ['ownerName', 'ownerPhone', 'ownerNameUpdatedAt', 'lastSeenAt']
      ).catch(() => {});
    } catch {
      setError('تعذر حفظ بيانات المالك.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>جارٍ التحضير...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!activated && error && error.startsWith('تعذر الاتصال بـ Firebase')) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.activationContainer}>
          <Text style={styles.activationTitle}>فشل الاتصال</Text>
          <View style={styles.card}>
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError('');
                setReady(false);
                setReloadKey((v) => v + 1);
              }}
              style={styles.activateButton}
            >
              <Text style={styles.activateButtonText}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (activated) {
    return <MainNavigator />;
  }

  if (!ownerName || !ownerPhone) {
    return <OwnerInfoScreen
      name={ownerName}
      phone={ownerPhone}
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={submitOwnerInfo}
    />;
  }

  return (
    <ActivationScreen
      deviceId={deviceId || '...'}
      attempts={attempts}
      maxAttempts={maxAttempts}
      lockedUntilMs={lockedUntilMs}
      onSubmit={submit}
      isSubmitting={isSubmitting}
      error={error}
    />
  );
}

function LaunchAnimation({ onDone }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.lottieWrap}>
        <LottieView
          source={require('./Plug in failed.json')}
          autoPlay
          loop={false}
          onAnimationFinish={onDone}
          style={styles.lottie}
        />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [showLaunch, setShowLaunch] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowLaunch(false), 2600);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      {showLaunch ? <LaunchAnimation onDone={() => setShowLaunch(false)} /> : <ActivationGate />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B0F2A',
  },
  lottieWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  lottie: {
    width: '100%',
    maxWidth: 420,
    height: 420,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '700',
  },
  activationContainer: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  activationTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'right',
  },
  activationSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'right',
  },
  card: {
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  label: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  input: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  metaText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  lockBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 214, 102, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 102, 0.25)',
    gap: 4,
  },
  lockText: {
    color: '#FFD666',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  lockTextSecondary: {
    color: 'rgba(255, 214, 102, 0.85)',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  errorBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.22)',
  },
  errorText: {
    color: '#FF8FA3',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 18,
  },
  activateButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6A82FF',
  },
  activateButtonDisabled: {
    opacity: 0.5,
  },
  activateButtonText: {
    color: '#0B0F2A',
    fontSize: 14,
    fontWeight: '900',
  },
  deviceText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'left',
    marginTop: 6,
  },
});
