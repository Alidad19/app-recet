import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  Image,
  Alert,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, initializeAuth, signInAnonymously } from 'firebase/auth';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LaunchAnimationView from './src/LaunchAnimationView';
import { getStableDeviceId } from './src/deviceId';
import { RoleContext } from './src/RoleContext';
import { OPERATOR_OWNER_NAME_KEY, setOperatorOwnerName } from './src/storage';
import Constants from 'expo-constants';
import * as Font from 'expo-font';
import { useFonts } from 'expo-font';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AddUserScreen from './src/screens/AddUserScreen';
import UserDetailsScreen from './src/screens/UserDetailsScreen';
import CardsScreen from './src/screens/CardsScreen';
import {
  ACTIVATION_CODES_COLLECTION,
  ACTIVATION_CONFIG_DOC,
  ACTIVATION_REQUESTS_COLLECTION,
  DEVICES_COLLECTION,
  FIREBASE_CONFIG,
  OPERATOR_REQUESTS_COLLECTION,
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

// المشغل يرى اسم صاحب المولدة للعرض فقط؛ يُقرأ من طلب المشغل المرتبط بالكود أو بالجهاز.
async function loadOperatorOwnerNameFromFirestore(deviceId, activationCode = '') {
  if ((!deviceId && !activationCode) || !isFirebaseConfigured()) return '';
  try {
    const app = getFirebaseApp();
    await ensureSignedIn(app);
    const db = getFirebaseFirestore(app);

    if (activationCode) {
      const byCode = await getDocs(query(
        collection(db, OPERATOR_REQUESTS_COLLECTION),
        where('activationCode', '==', activationCode),
        limit(1)
      )).catch(() => null);
      const nameFromCode = byCode?.empty === false ? readString(byCode.docs[0].data(), 'ownerName', '') : '';
      if (nameFromCode) {
        await setOperatorOwnerName(nameFromCode);
        return nameFromCode;
      }
    }

    if (deviceId) {
      const snap = await getDoc(doc(db, OPERATOR_REQUESTS_COLLECTION, deviceId)).catch(() => null);
      const ownerDisplayName = snap?.exists() ? readString(snap.data(), 'ownerName', '') : '';
      if (ownerDisplayName) await setOperatorOwnerName(ownerDisplayName);
      return ownerDisplayName;
    }
    return '';
  } catch {
    return '';
  }
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

async function readActivationRequest(deviceId) {
  const data = await firestoreGetDoc(`${ACTIVATION_REQUESTS_COLLECTION}/${deviceId}`);
  if (!data) return null;
  return {
    status: readString(data, 'status', 'pending'),
    activationCode: readString(data, 'activationCode', ''),
  };
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
  initialCode = '',
  onBack,
}) {
  const [code, setCode] = useState(initialCode || '');
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

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
        {onBack ? (
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← رجوع</Text>
          </Pressable>
        ) : null}
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

        </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PendingApprovalScreen({
  deviceId,
  ownerName,
  ownerPhone,
  requestStatus,
  assignedCode,
  isSubmitting,
  error,
  onRefresh,
  onManualCode,
  onActivateWithCode,
  onRetryRequest,
}) {
  const statusLabel =
    requestStatus === 'approved'
      ? 'تمت الموافقة'
      : requestStatus === 'code_ready'
        ? 'تم تجهيز كود التفعيل'
        : requestStatus === 'rejected'
          ? 'تم رفض الطلب'
          : 'قيد الانتظار';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.activationContainer}>
        <Text style={styles.activationTitle}>طلب التفعيل</Text>
        <Text style={styles.activationSubtitle}>تم إرسال طلبك إلى الإدارة</Text>

        <View style={styles.card}>
          <Text style={styles.statusText}>الحالة: {statusLabel}</Text>
          <Text style={styles.metaText}>الاسم: {ownerName}</Text>
          <Text style={styles.metaText}>الهاتف: {ownerPhone}</Text>

          {requestStatus === 'code_ready' ? (
            <View style={styles.codeValueBox}>
              <Text style={styles.codeValueText}>{assignedCode}</Text>
            </View>
          ) : null}

          {requestStatus === 'approved' ? (
            <Text style={styles.infoText}>تمت الموافقة على طلبك. اضغط «تحديث الحالة» للدخول.</Text>
          ) : null}

          {requestStatus === 'pending' ? (
            <Text style={styles.infoText}>
              يرجى الانتظار حتى يوافق الأدمن على الطلب. يتم التحقق من الحالة تلقائياً.
            </Text>
          ) : null}

          {requestStatus === 'rejected' ? (
            <Text style={styles.infoText}>تم رفض الطلب. يمكنك إعادة إرساله بعد تصحيح البيانات.</Text>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {requestStatus === 'code_ready' ? (
            <Pressable
              accessibilityRole="button"
              onPress={onActivateWithCode}
              disabled={isSubmitting || !assignedCode}
              style={[styles.activateButton, isSubmitting || !assignedCode ? styles.activateButtonDisabled : null]}
            >
              <Text style={styles.activateButtonText}>{isSubmitting ? '...' : 'تفعيل بالكود'}</Text>
            </Pressable>
          ) : null}

          {requestStatus === 'rejected' ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRetryRequest}
              disabled={isSubmitting}
              style={[styles.activateButton, isSubmitting ? styles.activateButtonDisabled : null]}
            >
              <Text style={styles.activateButtonText}>إعادة إرسال الطلب</Text>
            </Pressable>
          ) : null}

          <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>تحديث الحالة</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onManualCode} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>إدخال كود يدوياً</Text>
          </Pressable>

        </View>
      </View>
    </SafeAreaView>
  );
}

function RoleSelectionScreen({ onSelect }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.roleScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <View style={styles.roleCenter}>
        <View style={styles.roleHeader}>
          <View style={styles.roleIconBadge}>
            <Ionicons name="person-add-outline" size={34} color="#0B0F2A" />
          </View>
          <View style={styles.roleTexts}>
            <Text style={styles.roleTitle}>نوع التسجيل</Text>
            <Text style={styles.roleSubtitle}>اختر طريقة استخدامك للتطبيق للمتابعة</Text>
          </View>
        </View>

        <View style={styles.roleCardsRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelect('owner')}
            style={({ pressed }) => [styles.roleCard, pressed ? styles.roleCardPressed : null]}
          >
            <View style={[styles.roleCardIcon, { backgroundColor: 'rgba(106,130,255,0.14)' }]}>
              <Ionicons name="home-outline" size={30} color="#6A82FF" />
            </View>
            <Text style={[styles.roleCardTitle, { color: '#FFFFFF' }]}>صاحب مولدة</Text>
            <Text style={styles.roleCardDesc}>إدارة المولدة والمشغلين</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => onSelect('operator')}
            style={({ pressed }) => [styles.roleCard, pressed ? styles.roleCardPressed : null]}
          >
            <View style={[styles.roleCardIcon, { backgroundColor: 'rgba(88,214,141,0.14)' }]}>
              <Ionicons name="settings-outline" size={30} color="#58D68D" />
            </View>
            <Text style={[styles.roleCardTitle, { color: '#FFFFFF' }]}>مشغل</Text>
            <Text style={styles.roleCardDesc}>إدخال كود التفعيل فقط</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function OwnerInfoScreen({
  name: initialName,
  phone: initialPhone,
  role = 'owner',
  isSubmitting,
  error,
  onSubmit,
  onBack,
}) {
  const [name, setName] = useState(initialName || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [address, setAddress] = useState('');
  const [face, setFace] = useState(null);
  const [location, setLocation] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [locationError, setLocationError] = useState('');

  const pickFace = async (useCamera) => {
    Keyboard.dismiss();
    setPhotoError('');
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPhotoError('السماحية مرفوضة. فعّل الإذن من إعدادات التطبيق.');
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
            base64: true,
          });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        // تصغير الصورة إلى 480x480 وضغطها قبل الرفع لتقليل المساحة
        const resized = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 480, height: 480 } }],
          {
            compress: 0.6,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );
        setFace({ uri: resized.uri });
      }
    } catch {
      setPhotoError('تعذر تجهيز الصورة. حاول مرة أخرى.');
    }
  };

  const detectLocation = async () => {
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError('صلاحية الموقع مرفوضة. فعّلها من إعدادات التطبيق.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      setLocationError('تعذر تحديد الموقع. حاول مرة أخرى.');
    }
  };

  const submit = () => {
    onSubmit(name, phone, {
      faceUri: face?.uri || '',
      address,
      location,
    });
  };

  const canSubmit =
    !isSubmitting && !!name.trim() && !!phone.trim() && !!face?.uri &&
    (role !== 'owner' || (!!address.trim() && !!location));

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.activationContainer}>
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>← رجوع</Text>
            </Pressable>

            <Text style={styles.activationTitle}>
              {role === 'operator' ? 'بيانات المشغل' : 'بيانات صاحب المولدة'}
            </Text>
            <Text style={styles.activationSubtitle}>
              {role === 'operator'
                ? 'أدخل الاسم ورقم الهاتف والتقط صورة للوجه'
                : 'أدخل الاسم الرباعي والهاتف والعنوان والموقع، والتقط صورة للوجه'}
            </Text>

            <View style={styles.card}>
              <Text style={styles.label}>{role === 'operator' ? 'الاسم' : 'الاسم الرباعي'}</Text>
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
              />

              <Text style={styles.label}>صورة الوجه</Text>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => pickFace(true)}
                  disabled={isSubmitting}
                  style={styles.smallButton}
                >
                  <Text style={styles.smallButtonText}>التقاط صورة</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => pickFace(false)}
                  disabled={isSubmitting}
                  style={styles.smallButton}
                >
                  <Text style={styles.smallButtonText}>من الاستوديو</Text>
                </Pressable>
              </View>
              {face ? (
                <Image source={{ uri: face.uri }} style={styles.facePreview} />
              ) : null}
              {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}

              {role === 'owner' ? (
                <>
                  <Text style={styles.label}>العنوان</Text>
                  <TextInput
                    value={address}
                    onChangeText={setAddress}
                    placeholder="المحافظة، المنطقة، أقرب معلم"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={[styles.input, styles.multilineInput]}
                    autoCapitalize="words"
                    textAlign="right"
                    editable={!isSubmitting}
                    multiline
                  />

                  <Text style={styles.label}>الموقع</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={detectLocation}
                    disabled={isSubmitting}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {location ? 'تحديث الموقع' : 'تحديد الموقع'}
                    </Text>
                  </Pressable>
                  {location ? (
                    <Text style={styles.locationText}>
                      تم التحديد: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </Text>
                  ) : null}
                  {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
                </>
              ) : null}

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={submit}
                disabled={!canSubmit}
                style={[styles.activateButton, !canSubmit ? styles.activateButtonDisabled : null]}
              >
                <Text style={styles.activateButtonText}>
                  {isSubmitting ? '...' : 'متابعة'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

async function uploadFacePhoto(app, fileUri) {
  const uid = getFirebaseAuth(app).currentUser?.uid;
  if (!uid) throw new Error('لا يوجد مستخدم مصادق عليه');

  const bucket = FIREBASE_CONFIG.storageBucket || 'app-recet.firebasestorage.app';
  const path = `users/${uid}/face_${Date.now()}.jpg`;
  const encodedPath = encodeURIComponent(path);
  const token = await getFirebaseAuth(app).currentUser.getIdToken();

  const response = await FileSystem.uploadAsync(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`,
    fileUri,
    {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    }
  );

  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} ${response.body || ''}`);
  }

  const result = JSON.parse(response.body || '{}');
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${result.downloadTokens}`;
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
  const [role, setRole] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [requestStatus, setRequestStatus] = useState('');
  const [assignedCode, setAssignedCode] = useState('');
  const [manualReturnStatus, setManualReturnStatus] = useState('');
  const wasActivatedRef = useRef(false);

  // حماية من التجمّد الدائم على iOS إذا تأخر استجابة Firebase
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      setReady(true);
      setError((prev) => prev || 'تعذر تحميل البيانات. تحقق من الاتصال ثم أعد المحاولة.');
    }, 12000);
    return () => clearTimeout(t);
  }, [ready]);

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
          const deviceCode = readString(deviceData, 'activationCode', '');
          setActivationCode(deviceCode);
          const deviceRole = readString(deviceData, 'role', '');
          setRole(deviceRole);
          if (deviceRole === 'operator') loadOperatorOwnerNameFromFirestore(id, deviceCode);

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
          setRole('');
        }

        try {
          const req = await readActivationRequest(id);
          if (req) {
            setRequestStatus(req.status || 'pending');
            setAssignedCode(req.activationCode || '');
          }
        } catch {}

        setReady(true);
      } catch (e) {
        if (!mounted) return;
        console.error('Firebase Error Details:', e); // تسجيل الخطأ في الكونسول
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

  // متابعة حالة الجهاز لحظياً: عند توقيف الأدمن يتوقف التطبيق فوراً
  useEffect(() => {
    if (!deviceId || !isFirebaseConfigured()) return;

    let cancelled = false;
    let unsubscribe = null;

    (async () => {
      try {
        const app = getFirebaseApp();
        await ensureSignedIn(app);
        if (cancelled) return;

        const db = getFirebaseFirestore(app);
        unsubscribe = onSnapshot(doc(db, DEVICES_COLLECTION, deviceId), (snap) => {
          if (!snap.exists()) {
            // حذف المستخدم من الداشبورد: ابدأ من جديد بطلب اسم وهاتف جديدين
            wasActivatedRef.current = false;
            setActivated(false);
            setOwnerName('');
            setOwnerPhone('');
            setActivationCode('');
            setAttempts(0);
            setLockedUntilMs(null);
            setRequestStatus('');
            setAssignedCode('');
            setRole('');
            setError('');
            try {
              AsyncStorage.removeItem(OWNER_NAME_KEY);
              AsyncStorage.removeItem(OWNER_PHONE_KEY);
              AsyncStorage.removeItem(OPERATOR_OWNER_NAME_KEY);
            } catch {}
            return;
          }

          const data = snap.data();
          const expiresAtMs = readTimestampMs(data, 'expiresAt');
          const expired = expiresAtMs != null && expiresAtMs <= Date.now();
          const isActive = readBool(data, 'activated', false) && !expired;

          if (wasActivatedRef.current && !isActive) {
            setError(expired ? 'انتهى الاشتراك.' : 'تم توقيف المستخدم من قبل الإدارة.');
          }
          wasActivatedRef.current = isActive;

          setActivated(isActive);
          setAttempts(readInt(data, 'attempts', 0));
          setLockedUntilMs(readTimestampMs(data, 'lockUntil'));
          setOwnerName(readString(data, 'ownerName', ''));
          setOwnerPhone(readString(data, 'ownerPhone', ''));
          const currentCode = readString(data, 'activationCode', '');
          setActivationCode(currentCode);
          const nextRole = readString(data, 'role', '');
          if (nextRole) {
            setRole(nextRole);
            if (nextRole === 'operator') loadOperatorOwnerNameFromFirestore(deviceId, currentCode);
          }
        }, () => {});
      } catch {}
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId || !['pending', 'code_ready'].includes(requestStatus)) return;

    let mounted = true;
    const check = async () => {
      try {
        const req = await readActivationRequest(deviceId);
        if (!mounted) return;
        if (!req) {
          // تم حذف الطلب بعد الموافقة المباشرة: أعد قراءة بيانات الجهاز للدخول
          setRequestStatus('');
          setAssignedCode('');
          setReloadKey((v) => v + 1);
          return;
        }
        if (req.status !== requestStatus || (req.activationCode || '') !== assignedCode) {
          setRequestStatus(req.status || 'pending');
          setAssignedCode(req.activationCode || '');
        }
        if (req.status === 'approved') {
          setReloadKey((v) => v + 1);
        }
      } catch {}
    };

    check();
    const timer = setInterval(check, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [deviceId, requestStatus, assignedCode]);


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
        const phoneFromCode = readString(codeData, 'ownerPhone', '');
        const codeExpiresAtMs = readTimestampMs(codeData, 'expiresAt');
        const validMonths = Number(codeData.validMonths || 0);
        const durationDays = Number(codeData.durationDays || 0);
        const borrowNextDay = readBool(deviceData, 'borrowNextDay', false);
        const codeDeviceId = readString(codeData, 'deviceId', '');
        const roleFromCode = readString(codeData, 'role', '');

        // كل كود مرتبط بجهاز واحد: لا يُفعّل على جهاز آخر حتى لو لم يُستخدم بعد.
        if (codeDeviceId && codeDeviceId !== deviceId) {
          return {
            status: 'device_mismatch',
            attempts: currentAttempts,
            maxAttempts: max,
            lockMinutes: lockMins,
            lockedUntilMs: currentLockUntilMs,
          };
        }

        // المدة تُحسب من لحظة التفعيل، لا من تاريخ توليد الكود.
        const subscriptionDays =
          durationDays > 0 ? durationDays : validMonths > 0 ? validMonths * 30 : 0;

        if (!codeUsed) {
          tx.set(
            codeRef,
            {
              isUsed: true,
              deviceId,
              usedAt: serverTimestamp(),
              ownerName: ownerName || ownerFromCode || null,
              ownerPhone: ownerPhone || phoneFromCode || null,
            },
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
            ownerPhone: ownerPhone || phoneFromCode || null,
            role: roleFromCode || role || 'owner',
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
            ownerPhone: phoneFromCode,
            activationCode: codeUpper,
            role: roleFromCode || role || 'owner',
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

      if (result.status === 'device_mismatch') {
        setError('هذا الكود مخصص لجهاز آخر ولا يمكن تفعيله على هذا الجهاز.');
        return;
      }

      if (result.status === 'activated') {
        const activatedRole = result.role || role;
        setActivated(true);
        setActivationCode(result.activationCode || '');
        setRole(activatedRole);
        if (activatedRole === 'operator') {
          // اسم صاحب المولدة يُقرأ من طلب المشغل المرتبط بالكود للعرض فقط، ولا يُستبدل باسم المشغل.
          await loadOperatorOwnerNameFromFirestore(deviceId, result.activationCode || codeUpper);
        } else {
          setOwnerName(result.ownerName || ownerName);
          setOwnerPhone(result.ownerPhone || ownerPhone);
          await saveOwnerNameLocally(result.ownerName || ownerName);
          await saveOwnerPhoneLocally(result.ownerPhone || ownerPhone);
        }
        try {
          await deleteDoc(doc(db, ACTIVATION_REQUESTS_COLLECTION, deviceId));
        } catch {}
        setRequestStatus('');
        setAssignedCode('');
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

  const submitOwnerInfo = async (name, phone, extras = {}) => {
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

      // عند إعادة إرسال طلب مرفوض نحتفظ بالصورة والعنوان والموقع السابقة
      const isRetry = !!extras.retry;
      const oldRequest = isRetry
        ? (await firestoreGetDoc(`${ACTIVATION_REQUESTS_COLLECTION}/${deviceId}`)) || {}
        : {};

      let facePhotoUrl = oldRequest.facePhotoUrl || '';
      let address = oldRequest.address || '';
      let location = oldRequest.location || null;
      let locationUrl = oldRequest.locationUrl || '';

      if (!isRetry) {
        if (!extras.faceUri) {
          setError('التقط صورة الوجه قبل المتابعة.');
          return;
        }
        if (role === 'owner' && !String(extras.address || '').trim()) {
          setError('أدخل العنوان.');
          return;
        }
        if (role === 'owner' && !extras.location) {
          setError('اضغط «تحديد الموقع» قبل المتابعة.');
          return;
        }

        try {
          const app = getFirebaseApp();
          await ensureSignedIn(app);
          facePhotoUrl = await uploadFacePhoto(app, extras.faceUri);
          address = String(extras.address || '').trim();
          location = extras.location || null;
          locationUrl = location
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`
            : '';
        } catch (uploadError) {
          console.error('face upload failed', uploadError);
          setError(`تعذر رفع صورة الوجه: ${uploadError?.message || 'خطأ غير معروف'}`);
          return;
        }
      }

      await saveOwnerNameLocally(trimmedName);
      await saveOwnerPhoneLocally(trimmedPhone);
      setOwnerName(trimmedName);
      setOwnerPhone(trimmedPhone);
      setError('');

      const extraFields = {
        facePhotoUrl,
        address,
        location,
        locationUrl,
        role: role === 'operator' ? 'operator' : 'owner',
      };

      const deviceDocPath = `${DEVICES_COLLECTION}/${deviceId}`;
      firestorePatchDoc(
        deviceDocPath,
        {
          ownerName: trimmedName,
          ownerPhone: trimmedPhone,
          ownerNameUpdatedAt: new Date(),
          lastSeenAt: new Date(),
          ...extraFields,
        },
        ['ownerName', 'ownerPhone', 'ownerNameUpdatedAt', 'lastSeenAt', 'facePhotoUrl', 'address', 'location', 'locationUrl', 'role']
      ).catch(() => {});

      if (role === 'operator') {
        const db = getFirebaseFirestore(getFirebaseApp());
        await setDoc(
          doc(db, OPERATOR_REQUESTS_COLLECTION, deviceId),
          {
            deviceId,
            operatorName: trimmedName,
            operatorPhone: trimmedPhone,
            ownerName: '',
            ownerPhone: '',
            selfRegistered: true,
            status: 'pending',
            activationCode: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ...extraFields,
          }
        );

        await firestorePatchDoc(
          `${ACTIVATION_REQUESTS_COLLECTION}/${deviceId}`,
          {
            deviceId,
            ownerName: trimmedName,
            ownerPhone: trimmedPhone,
            type: 'operator',
            status: 'pending',
            activationCode: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ...extraFields,
          },
          ['deviceId', 'ownerName', 'ownerPhone', 'type', 'status', 'activationCode', 'createdAt', 'updatedAt', 'facePhotoUrl', 'address', 'location', 'locationUrl', 'role']
        );
      } else {
        await firestorePatchDoc(
          `${ACTIVATION_REQUESTS_COLLECTION}/${deviceId}`,
          {
            deviceId,
            deviceName: Device.modelName || Device.deviceName || 'جهاز أندرويد',
            ownerName: trimmedName,
            ownerPhone: trimmedPhone,
            type: 'owner',
            status: 'pending',
            activationCode: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ...extraFields,
          },
          [
            'deviceId',
            'deviceName',
            'ownerName',
            'ownerPhone',
            'type',
            'status',
            'activationCode',
            'createdAt',
            'updatedAt',
            'facePhotoUrl',
            'address',
            'location',
            'locationUrl',
            'role',
          ]
        );
      }

      setRequestStatus('pending');
      setAssignedCode('');
    } catch {
      setError('تعذر إرسال طلب التفعيل. تأكد من السماح بالكتابة في قواعد Firestore.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshRequest = async () => {
    if (!deviceId) return;
    setIsSubmitting(true);
    setError('');
    try {
      const req = await readActivationRequest(deviceId);
      if (!req) {
        setRequestStatus('');
        setAssignedCode('');
        setReloadKey((v) => v + 1);
        setError('لا يوجد طلب تفعيل حالياً.');
        return;
      }
      setRequestStatus(req.status || 'pending');
      setAssignedCode(req.activationCode || '');
      if (req.status === 'approved') setReloadKey((v) => v + 1);
    } catch {
      setError('تعذر تحديث حالة الطلب.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activateWithCode = async () => {
    await submit(assignedCode);
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
    return (
      <RoleContext.Provider value={role || 'owner'}>
        <MainNavigator />
      </RoleContext.Provider>
    );
  }

  if (!ownerName || !ownerPhone) {
    if (!role) {
      return (
        <RoleSelectionScreen
          onSelect={(selected) => {
            setRole(selected);
            setError('');
            if (selected === 'operator') {
              // المشغل لا يسجّل بياناته، يدخل كود التفعيل فقط
              setRequestStatus('');
              setAssignedCode('');
            }
          }}
        />
      );
    }
    if (role === 'operator') {
      return (
        <ActivationScreen
          deviceId={deviceId || '...'}
          attempts={attempts}
          maxAttempts={maxAttempts}
          lockedUntilMs={lockedUntilMs}
          onSubmit={submit}
          isSubmitting={isSubmitting}
          error={error}
          initialCode={assignedCode || ''}
          onBack={() => { setRole(''); setError(''); }}
        />
      );
    }
    return <OwnerInfoScreen
      name={ownerName}
      phone={ownerPhone}
      role={role}
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={submitOwnerInfo}
      onBack={() => { setRole(''); setError(''); }}
    />;
  }

  if (requestStatus && requestStatus !== 'manual') {
    return (
      <PendingApprovalScreen
        deviceId={deviceId || '...'}
        ownerName={ownerName}
        ownerPhone={ownerPhone}
        requestStatus={requestStatus}
        assignedCode={assignedCode}
        isSubmitting={isSubmitting}
        error={error}
        onRefresh={refreshRequest}
        onManualCode={() => {
          setManualReturnStatus(requestStatus);
          setRequestStatus('manual');
          setError('');
        }}
        onActivateWithCode={activateWithCode}
        onRetryRequest={() => submitOwnerInfo(ownerName, ownerPhone, { retry: true })}
      />
    );
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
      initialCode={assignedCode}
      onBack={() => {
        setRequestStatus(manualReturnStatus || 'pending');
        setManualReturnStatus('');
        setError('');
      }}
    />
  );
}

function LaunchAnimation({ onDone }) {
  return (
    <View style={styles.launchRoot}>
      <StatusBar style="light" />
      <LaunchAnimationView onDone={onDone} />
    </View>
  );
}

export default function App() {
  const [showLaunch, setShowLaunch] = useState(true);
  const [fontsFallback, setFontsFallback] = useState(false);
  const [fontsLoaded] = useFonts({
    'Cairo-Regular': require('./assets/fonts/Cairo-Regular.ttf'),
  });

  useEffect(() => {
    const t = setTimeout(() => setShowLaunch(false), 2600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setFontsFallback(true), 3500);
    return () => clearTimeout(t);
  }, []);

  const fontsReady = fontsLoaded || fontsFallback;

  if (!fontsReady) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

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
  launchRoot: {
    flex: 1,
    backgroundColor: '#0B0F2A',
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
    fontFamily: 'Cairo-Regular',
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
    fontFamily: 'Cairo-Regular',
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
    fontFamily: 'Cairo-Regular',
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
    fontFamily: 'Cairo-Regular',
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
    fontFamily: 'Cairo-Regular',
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
    fontFamily: 'Cairo-Regular',
    textAlign: 'right',
  },
  lockTextSecondary: {
    color: 'rgba(255, 214, 102, 0.85)',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Cairo-Regular',
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
    fontFamily: 'Cairo-Regular',
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
    fontFamily: 'Cairo-Regular',
  },
  deviceText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Cairo-Regular',
    textAlign: 'left',
    marginTop: 6,
  },
  roleScreen: {
    flex: 1,
    backgroundColor: '#0B0F2A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  roleCenter: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
  },
  roleHeader: {
    alignItems: 'center',
    marginBottom: 22,
  },
  roleTexts: {
    alignItems: 'center',
    marginTop: 12,
  },
  roleIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6A82FF',
    shadowColor: '#6A82FF',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  roleTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'Cairo-Regular',
    textAlign: 'center',
    marginTop: 10,
  },
  roleSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontFamily: 'Cairo-Regular',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  roleCardsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 30,
  },
  roleCard: {
    flex: 1,
    minHeight: 200,
    padding: 18,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  roleCardPressed: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    transform: [{ scale: 0.98 }],
  },
  roleCardIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleCardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Cairo-Regular',
    textAlign: 'center',
    marginTop: 4,
  },
  roleCardDesc: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontFamily: 'Cairo-Regular',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: '85%',
  },
  roleCardArrow: {
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  formScroll: {
    flexGrow: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 36,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backButtonText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Cairo-Regular',
  },
  smallButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  smallButtonText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Cairo-Regular',
  },
  facePreview: {
    width: 90,
    height: 90,
    borderRadius: 14,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  multilineInput: {
    height: 64,
    paddingTop: 12,
    letterSpacing: 0,
  },
  locationText: {
    color: '#8FE3B0',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Cairo-Regular',
    textAlign: 'right',
  },
  statusText: {
    color: '#FFD666',
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Cairo-Regular',
    textAlign: 'right',
  },
  infoText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    lineHeight: 19,
    fontFamily: 'Cairo-Regular',
    textAlign: 'right',
  },
  codeValueBox: {
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(106,130,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(106,130,255,0.35)',
  },
  codeValueText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Cairo-Regular',
    letterSpacing: 3,
  },
  secondaryButton: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secondaryButtonText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Cairo-Regular',
  },
});
