import { getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, limit, query, updateDoc, where } from 'firebase/firestore';
import { DEVICES_COLLECTION, OPERATOR_REQUESTS_COLLECTION } from './config';
import { getStableDeviceId } from './deviceId';

// المشغلون يقرأون سعر الأمبير وقائمة المشتركين من طلب المشغل المرتبط بكود التفعيل.
// صاحب المولدة يكتبهما في طلبات المشغلين المرتبطة به، لأن البيانات الأساسية محفوظة محلياً على جهازه.

async function getFirebaseContext() {
  const app = getApps()[0];
  if (!app) return null;
  const auth = getAuth(app);
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch {
      return null;
    }
  }
  return auth.currentUser ? { app, auth } : null;
}

export async function fetchSharedOwnerData() {
  const empty = { amperePrice: 0, users: [] };
  try {
    const ctx = await getFirebaseContext();
    if (!ctx) return empty;

    const deviceId = await getStableDeviceId();
    if (!deviceId) return empty;

    const db = getFirestore(ctx.app);
    const deviceSnap = await getDoc(doc(db, DEVICES_COLLECTION, deviceId)).catch(() => null);
    const activationCode = deviceSnap?.exists()
      ? String(deviceSnap.data()?.activationCode || '').trim().toUpperCase()
      : '';
    if (!activationCode) return empty;

    const snap = await getDocs(query(
      collection(db, OPERATOR_REQUESTS_COLLECTION),
      where('activationCode', '==', activationCode),
      limit(1)
    )).catch(() => null);

    if (!snap || snap.empty) return empty;

    const data = snap.docs[0].data() || {};
    const amperePrice = Number(data.amperePrice || 0);
    const users = Array.isArray(data.users) ? data.users : [];

    return {
      amperePrice: amperePrice > 0 ? amperePrice : 0,
      users,
    };
  } catch {
    return empty;
  }
}

export async function publishSharedOwnerData({ amperePrice = 0, ownerName = '', ownerPhone = '', users = [] }) {
  try {
    const ctx = await getFirebaseContext();
    if (!ctx) return;

    const db = getFirestore(ctx.app);
    const uid = ctx.auth.currentUser?.uid || '';
    const foundIds = new Set();

    const queries = [];
    if (uid) {
      queries.push(query(collection(db, OPERATOR_REQUESTS_COLLECTION), where('ownerAuthUid', '==', uid)));
      queries.push(query(collection(db, OPERATOR_REQUESTS_COLLECTION), where('ownerUid', '==', uid)));
    }
    if (ownerName) {
      queries.push(query(collection(db, OPERATOR_REQUESTS_COLLECTION), where('ownerName', '==', ownerName)));
    }
    if (!queries.length) return;

    const snaps = await Promise.all(queries.map((q) => getDocs(q).catch(() => null)));
    snaps.forEach((snap) => {
      if (!snap) return;
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        if (ownerPhone && data.ownerPhone && String(data.ownerPhone) !== String(ownerPhone)) return;
        foundIds.add(d.id);
      });
    });

    if (!foundIds.size) return;

    const payload = {
      amperePrice: Number(amperePrice) || 0,
      users: Array.isArray(users) ? users : [],
      sharedAt: Date.now(),
    };

    await Promise.all(
      [...foundIds].map((id) =>
        updateDoc(doc(db, OPERATOR_REQUESTS_COLLECTION, id), payload).catch(() => {})
      )
    );
  } catch {
    // الفشل في المزامنة لا يمنع حفظ السعر محلياً على جهاز صاحب المولدة.
  }
}
