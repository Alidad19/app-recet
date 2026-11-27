import { getApps } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signOut,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { DEVICES_COLLECTION, OPERATOR_REQUESTS_COLLECTION, OWNERS_COLLECTION } from './config';
import { getStableDeviceId } from './deviceId';

let configured = false;
let googleSigninModule = null;

// تحميل متأخر حتى لا يتعطل التطبيق في Expo Go أو أي بناء لا يحتوي على الوحدة الأصلية.
function getGoogleSignin() {
  if (googleSigninModule) return googleSigninModule;
  try {
    // Expo Go لا يحتوي على الوحدات الأصلية؛ لا نحاول تحميلها إطلاقاً.
    const constants = require('expo-constants');
    const appOwnership = constants?.default?.appOwnership || constants?.appOwnership;
    if (appOwnership === 'expo') {
      googleSigninModule = null;
      return null;
    }
  } catch {
    // تجاهل؛ سنحاول التحميل في البناءات الأصلية.
  }
  try {
    const mod = require('@react-native-google-signin/google-signin');
    googleSigninModule = mod?.GoogleSignin || mod?.default || null;
  } catch {
    googleSigninModule = null;
  }
  return googleSigninModule;
}

export function isGoogleSignInAvailable() {
  return Boolean(getGoogleSignin());
}

export function configureGoogleSignIn() {
  if (configured) return;
  const GoogleSignin = getGoogleSignin();
  if (!GoogleSignin) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  if (!webClientId) return;
  try {
    GoogleSignin.configure({
      webClientId,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
    configured = true;
  } catch {
    configured = false;
  }
}

export function isGoogleUser(user) {
  return Boolean(user?.providerData?.some((provider) => provider.providerId === 'google.com'));
}

export function getCurrentAuthUser() {
  const app = getApps()[0];
  return app ? getAuth(app).currentUser : null;
}

export function watchAuth(callback) {
  const app = getApps()[0];
  if (!app) return () => {};
  return onAuthStateChanged(getAuth(app), callback);
}

export async function ensureAnonymousAuth() {
  const app = getApps()[0];
  if (!app) return null;
  const auth = getAuth(app);
  if (!auth.currentUser) {
    await signInAnonymously(auth).catch(() => {});
  }
  return auth.currentUser;
}

async function migrateOwnerLinks(oldUid, newUid, email) {
  if (!oldUid || oldUid === newUid) return;
  const app = getApps()[0];
  if (!app) return;

  const db = getFirestore(app);
  const snap = await getDocs(query(
    collection(db, OPERATOR_REQUESTS_COLLECTION),
    where('ownerAuthUid', '==', oldUid)
  )).catch(() => null);

  if (!snap || snap.empty) return;

  await Promise.all(snap.docs.map((d) => updateDoc(
    doc(db, OPERATOR_REQUESTS_COLLECTION, d.id),
    {
      ownerUid: newUid,
      ownerAuthUid: newUid,
      ownerEmail: email || '',
      updatedAt: Date.now(),
    }
  ).catch(() => {})));
}

async function linkCurrentDevice(user) {
  const app = getApps()[0];
  if (!app || !user) return;
  const deviceId = await getStableDeviceId();
  if (!deviceId) return;

  const db = getFirestore(app);
  await updateDoc(doc(db, DEVICES_COLLECTION, deviceId), {
    ownerUid: user.uid,
    ownerEmail: user.email || '',
    lastSeenAt: Date.now(),
  }).catch(() => {});
}

export async function signInWithGoogleAccount() {
  configureGoogleSignIn();
  const GoogleSignin = getGoogleSignin();
  if (!GoogleSignin) {
    throw new Error('تسجيل Gmail متاح في نسخة APK المبنية فقط، وليس في Expo Go.');
  }
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  if (!webClientId) {
    throw new Error('لم يتم ضبط Google Web Client ID. أضف EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID في متغيرات EAS ثم أعد البناء.');
  }

  const app = getApps()[0];
  if (!app) throw new Error('Firebase غير جاهز حالياً.');

  const auth = getAuth(app);
  const previousUid = auth.currentUser?.uid || '';

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch {
    // متاح على أندرويد فقط؛ على المنصات الأخرى نكمل مباشرة.
  }

  const result = await GoogleSignin.signIn();
  const idToken = result?.data?.idToken || result?.idToken;
  if (!idToken) throw new Error('لم يتم الحصول على رمز دخول من Google.');

  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, credential);
  const user = userCredential.user;

  if (previousUid && previousUid !== user.uid) {
    await migrateOwnerLinks(previousUid, user.uid, user.email || '');
  }
  await linkCurrentDevice(user);

  return user;
}

export async function signOutGoogleAccount() {
  configureGoogleSignIn();
  const GoogleSignin = getGoogleSignin();
  if (GoogleSignin) {
    try {
      await GoogleSignin.signOut();
    } catch {
      // تجاهل الفشل؛ سنخرج من Firebase على أي حال.
    }
  }

  const app = getApps()[0];
  if (!app) return;
  const auth = getAuth(app);
  await signOut(auth).catch(() => {});
  await ensureAnonymousAuth();
}

export async function uploadOwnerAccount({ name = '', phone = '', amperePrice = 0, theme = 'light', users = [] }) {
  const app = getApps()[0];
  if (!app) return;
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user || !isGoogleUser(user)) return;

  const db = getFirestore(app);
  await setDoc(doc(db, OWNERS_COLLECTION, user.uid), {
    uid: user.uid,
    email: user.email || '',
    name: String(name || ''),
    phone: String(phone || ''),
    amperePrice: Number(amperePrice) || 0,
    theme: theme || 'light',
    users: Array.isArray(users) ? users : [],
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await linkCurrentDevice(user);
}

export async function downloadOwnerAccount() {
  const app = getApps()[0];
  if (!app) return null;
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user || !isGoogleUser(user)) return null;

  const db = getFirestore(app);
  const snap = await getDoc(doc(db, OWNERS_COLLECTION, user.uid)).catch(() => null);
  return snap?.exists() ? snap.data() : null;
}
