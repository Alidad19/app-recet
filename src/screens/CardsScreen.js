import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, StatusBar, ActivityIndicator, Alert, I18nManager, Image, Clipboard, Keyboard } from 'react-native';
import { getFirestore, addDoc, collection, deleteDoc, getDoc, getDocs, doc, query, orderBy, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { Colors, Shadows, Fonts } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { ACTIVATION_REQUESTS_COLLECTION, DEVICES_COLLECTION, FIREBASE_CONFIG, NOTIFICATIONS_COLLECTION, OPERATOR_REQUESTS_COLLECTION } from '../config';
import { getStableDeviceId } from '../deviceId';
import { useRole, isOperator as hasOperatorRole } from '../RoleContext';
import { getOperatorOwnerName } from '../storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OWNER_NAME_KEY = '@generator_owner_name';
const OWNER_PHONE_KEY = '@generator_owner_phone';

async function uploadOperatorPhoto(auth, operatorId, label, uri) {
  const labelName =
    label === 'idfront' ? 'وجه بطاقة الموحدة'
      : label === 'idback' ? 'ظهر بطاقة الموحدة'
        : 'الصورة الشخصية';

  try {
    // تأكد من وجود مستخدم مصادق عليه قبل رفع أي صورة.
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('لا يوجد مستخدم مصادق عليه');

    const bucket = FIREBASE_CONFIG.storageBucket || 'app-recet.firebasestorage.app';
    const path = `users/${uid}/operator_${operatorId}_${label}_${Date.now()}.jpg`;
    const encodedPath = encodeURIComponent(path);
    const token = await auth.currentUser.getIdToken(true);

    const response = await FileSystem.uploadAsync(
      `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`,
      uri,
      {
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      }
    );

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.body || 'لا يوجد رد من Firebase Storage'}`);
    }

    const result = JSON.parse(response.body || '{}');
    if (!result.downloadTokens) {
      throw new Error('لم يُرجع Firebase رابط تحميل للصورة');
    }

    // تُحفظ الصورة في Storage كرابط فقط، ولا تُكتب بيانات الصورة داخل Firestore.
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${result.downloadTokens}`;
  } catch (error) {
    throw new Error(`تعذر رفع ${labelName}: ${error?.message || 'خطأ غير معروف'}`);
  }
}

export default function CardsScreen({ navigation }) {
  const role = useRole();
  const isOperator = hasOperatorRole(role);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('light');
  const [visibleCodes, setVisibleCodes] = useState({});

  const toggleCodeVisibility = (code) => {
    setVisibleCodes(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const [operatorModalVisible, setOperatorModalVisible] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [operatorPhone, setOperatorPhone] = useState('');
  const [operatorPhotos, setOperatorPhotos] = useState({ idFront: '', idBack: '', selfie: '' });
  const [operatorSubmitting, setOperatorSubmitting] = useState(false);
  const [photoSourceKey, setPhotoSourceKey] = useState('');
  const [photoSourceLabel, setPhotoSourceLabel] = useState('');

  const captureOperatorPhoto = async (key, useCamera) => {
    try {
      Keyboard.dismiss();
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'تنبيه',
          useCamera
            ? 'السماح باستخدام الكاميرا مطلوب لإضافة صورة المشغل.'
            : 'السماح بالوصول إلى الاستوديو مطلوب لإضافة صورة المشغل.'
        );
        return;
      }

      const options = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      };
      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets?.[0]?.uri) {
        const resized = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 480, height: 480 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );
        setOperatorPhotos((prev) => ({ ...prev, [key]: resized.uri }));
      }
    } catch {
      Alert.alert('خطأ', 'تعذر تجهيز الصورة. حاول مرة أخرى.');
    }
  };

  const pickOperatorPhoto = (key, label) => {
    Keyboard.dismiss();
    setPhotoSourceKey((prev) => (prev === key ? '' : key));
    setPhotoSourceLabel(label || 'صورة المشغل');
  };

  const choosePhotoSource = (useCamera) => {
    const key = photoSourceKey;
    setPhotoSourceKey('');
    setPhotoSourceLabel('');
    // انتظار إغلاق نافذة الاختيار قبل إقلاع الكاميرا لتجنب تعليقها على أندرويد
    if (key) setTimeout(() => captureOperatorPhoto(key, useCamera), 150);
  };

  const copyCode = async (code) => {
    if (!code) return;
    try {
      await Clipboard.setString(String(code));
      Alert.alert('تم النسخ', 'تم نسخ كود التفعيل.');
    } catch {
      Alert.alert('تعذر النسخ', 'لم يتم نسخ الكود. حاول مرة أخرى.');
    }
  };

  const submitOperator = async () => {
    const name = String(operatorName || '').trim();
    const phone = String(operatorPhone || '').trim();
    if (!name) {
      Alert.alert('تنبيه', 'أدخل اسم المشغل.');
      return;
    }
    if (!phone) {
      Alert.alert('تنبيه', 'أدخل رقم هاتف المشغل.');
      return;
    }
    if (!/^\d{11}$/.test(phone)) {
      Alert.alert('تنبيه', 'يجب أن يتكون رقم هاتف المشغل من 11 رقماً بالضبط.');
      return;
    }
    if (!operatorPhotos.idFront || !operatorPhotos.idBack || !operatorPhotos.selfie) {
      Alert.alert('تنبيه', 'أضف صور بطاقة الموحدة (الوجه والظهر) والصورة الشخصية للمشغل.');
      return;
    }

    setOperatorSubmitting(true);
    try {
      const db = getFirestore(getApps()[0]);
      const auth = getAuth(getApps()[0]);
      const [ownerNameLocal, ownerPhoneLocal] = await Promise.all([
        AsyncStorage.getItem(OWNER_NAME_KEY),
        AsyncStorage.getItem(OWNER_PHONE_KEY),
      ]);

      const requestRef = doc(collection(db, OPERATOR_REQUESTS_COLLECTION));
      const operatorId = requestRef.id;

      const [idFrontUrl, idBackUrl, selfieUrl] = await Promise.all([
        uploadOperatorPhoto(auth, operatorId, 'idfront', operatorPhotos.idFront),
        uploadOperatorPhoto(auth, operatorId, 'idback', operatorPhotos.idBack),
        uploadOperatorPhoto(auth, operatorId, 'selfie', operatorPhotos.selfie),
      ]);

      await setDoc(requestRef, {
        deviceId: operatorId,
        operatorName: name,
        operatorPhone: phone,
        ownerName: ownerNameLocal || '',
        ownerPhone: ownerPhoneLocal || '',
        ownerAuthUid: auth.currentUser?.uid || '',
        ownerUid: auth.currentUser?.uid || '',
        ownerEmail: auth.currentUser?.email || '',
        selfRegistered: false,
        status: 'pending',
        activationCode: null,
        idFrontUrl,
        idBackUrl,
        facePhotoUrl: selfieUrl,
        selfieUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setOperatorName('');
      setOperatorPhone('');
      setOperatorPhotos({ idFront: '', idBack: '', selfie: '' });
      setOperatorModalVisible(false);
      Alert.alert('تم الإرسال', 'تم إرسال طلب المشغل وصوره إلى الداشبورد.');
    } catch (e) {
      console.error(e);
      Alert.alert(
        'تعذر إرسال طلب المشغل',
        e?.message ? String(e.message) : 'تأكد من قواعد Firebase Storage وFirestore.'
      );
    } finally {
      setOperatorSubmitting(false);
    }
  };

  const deleteOperator = (item) => {
    Alert.alert(
      'تأكيد الحذف',
      `هل تريد حذف المشغل ${item.operatorName}؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = getFirestore(getApps()[0]);
              try {
                await deleteDoc(doc(db, OPERATOR_REQUESTS_COLLECTION, item.operatorId));
              } catch (deleteError) {
                console.error('delete operator failed', deleteError);
                Alert.alert('خطأ', 'تعذر حذف المشغل. تأكد من قواعد Firestore.');
                return;
              }
              try {
                await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
                  type: 'operator_deleted',
                  message: `صاحب المولدة ${item.ownerName || '---'} حذف المشغل ${item.operatorName}`,
                  ownerName: item.ownerName || '',
                  operatorName: item.operatorName || '',
                  createdAt: serverTimestamp(),
                  expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
                });
              } catch (notifyError) {
                console.error('notification failed', notifyError);
              }
              Alert.alert('تم', 'تم حذف المشغل.');
              fetchCards();
            } catch (e) {
              console.error(e);
              Alert.alert('خطأ', 'حدث خطأ غير متوقع.');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    AsyncStorage.getItem('@app_theme').then(t => setTheme(t || 'light'));
    fetchCards();
    const unsubscribe = navigation.addListener('focus', () => fetchCards());
    // تحديث هادئ حتى يظهر كود المشغل فور موافقة الإدارة دون مغادرة الشاشة
    const timer = setInterval(() => fetchCards(true), 5000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [navigation, isOperator]);

  const fetchCards = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const db = getFirestore(getApps()[0]);
      const auth = getAuth(getApps()[0]);
      const currentUid = auth.currentUser?.uid || '';
      const deviceId = await getStableDeviceId();

      // بطاقة صاحب المولدة (هذا الجهاز) تظهر أولاً، ثم المشغلون الذين أضافهم.
      const [deviceSnap, ownerReqSnap, opSnap, localName, localPhone, storedOwnerDisplayName] = await Promise.all([
        getDoc(doc(db, DEVICES_COLLECTION, deviceId)).catch(() => null),
        getDoc(doc(db, ACTIVATION_REQUESTS_COLLECTION, deviceId)).catch(() => null),
        getDocs(query(collection(db, OPERATOR_REQUESTS_COLLECTION), orderBy('createdAt', 'desc'))).catch(() => null),
        AsyncStorage.getItem(OWNER_NAME_KEY),
        AsyncStorage.getItem(OWNER_PHONE_KEY),
        getOperatorOwnerName(),
      ]);

      const deviceData = deviceSnap?.exists() ? deviceSnap.data() || {} : {};
      const ownerReqData = ownerReqSnap?.exists() ? ownerReqSnap.data() || {} : {};
      const ownerCard = {
        id: deviceId,
        kind: 'owner',
        local: !deviceSnap?.exists(),
        activationCode: deviceData.activationCode || ownerReqData.activationCode || '',
        isUsed: Boolean(deviceData.activated),
        requestStatus: ownerReqData.status || '',
        ownerName: deviceData.ownerName || ownerReqData.ownerName || localName || '',
        ownerPhone: deviceData.ownerPhone || ownerReqData.ownerPhone || localPhone || '',
        createdAt: deviceData.createdAt || ownerReqData.createdAt || null,
        expiresAt: deviceData.expiresAt || null,
        borrowNextDay: Boolean(deviceData.borrowNextDay),
      };

      const operators = opSnap ? opSnap.docs
        .filter((d) => {
          const data = d.data();
          const sameOwner =
            (data.ownerName || '') === localName &&
            (!localPhone || (data.ownerPhone || '') === localPhone);
          return Boolean(currentUid && data.ownerAuthUid === currentUid) || sameOwner;
        })
        .map((d) => {
          const data = d.data();
          return {
            id: `operator-${d.id}`,
            kind: 'operator',
            operatorId: d.id,
            operatorName: data.operatorName || '---',
            operatorPhone: data.operatorPhone || '---',
            status: data.status || 'pending',
            activationCode: data.activationCode || null,
            createdAt: data.createdAt || null,
            ownerName: data.ownerName || localName,
            ownerPhone: data.ownerPhone || localPhone || '',
          };
        }) : [];

      if (isOperator) {
        // المشغل يرى بطاقته واسم صاحب المولدة فقط، ولا يستطيع حذف صاحب المولدة.
        const ownOperator = operators.find((op) => op.operatorId === deviceId);
        if (ownOperator) {
          setCards([{ ...ownOperator, ownerName: ownOperator.ownerName || storedOwnerDisplayName || '' }]);
        } else {
          setCards([{
            id: `operator-${deviceId}`,
            kind: 'operator',
            operatorId: deviceId,
            operatorName: ownerCard.ownerName || '---',
            operatorPhone: ownerCard.ownerPhone || '',
            status: ownerCard.requestStatus || (ownerCard.isUsed ? 'code_ready' : 'pending'),
            activationCode: ownerCard.activationCode || null,
            createdAt: ownerCard.createdAt,
            ownerName: storedOwnerDisplayName || '',
          }]);
        }
      } else {
        setCards([ownerCard, ...operators]);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('خطأ', 'فشل في جلب البطاقات');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getExpiresAtMs = (item) => {
    const expiresAt = item.expiresAt;
    if (expiresAt?.toMillis) return expiresAt.toMillis();
    if (expiresAt instanceof Date) return expiresAt.getTime();
    if (typeof expiresAt === 'number') return expiresAt;
    return null;
  };

  const formatRemainingTime = (ms) => {
    if (ms == null) return 'غير معروف';
    if (ms <= 0) return 'انتهى';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (days > 0) {
      return `${days} يوم${days === 1 ? '' : ''} ${hours} ساعة`;
    }
    if (hours > 0) {
      return `${hours} ساعة ${minutes} دقيقة`;
    }
    return `${minutes} دقيقة`;
  };

  const extendCardByOneDay = async (item) => {
    const expiresAtMs = getExpiresAtMs(item);
    const nowMs = Date.now();
    if (expiresAtMs == null) {
      Alert.alert('خطأ', 'لا يوجد تاريخ انتهاء صالح لهذه البطاقة.');
      return;
    }
    if (item.borrowNextDay) {
      Alert.alert('تم التمديد سابقًا', 'تم بالفعل تمديد الاشتراك. سيتم خصم يوم من الاشتراك القادم عند تفعيل الكود الجديد.');
      return;
    }

    if (expiresAtMs - nowMs > 24 * 60 * 60 * 1000) {
      Alert.alert('غير مسموح', 'يمكن التمديد فقط عندما يتبقى يوم واحد أو أقل.');
      return;
    }

    try {
      const db = getFirestore(getApps()[0]);
      const newExpiresAtMs = expiresAtMs + 24 * 60 * 60 * 1000;
      await updateDoc(doc(db, DEVICES_COLLECTION, item.id), {
        expiresAt: new Date(newExpiresAtMs),
        borrowNextDay: true,
      });
      Alert.alert('تم التمديد', 'تم تمديد الاشتراك ليوم واحد. سيتم خصم يوم من الكود القادم عند استخدامه.');
      fetchCards();
    } catch (e) {
      console.error(e);
      Alert.alert('خطأ', 'فشل في تمديد الاشتراك. حاول مرة أخرى.');
    }
  };

  const currentColors = Colors[theme];

  const renderPhotoPicker = (key, label) => {
    const active = photoSourceKey === key;
    return (
      <View style={{ marginBottom: active ? 6 : 10 }}>
        <TouchableOpacity
          onPress={() => pickOperatorPhoto(key, label)}
          style={{
            flexDirection: 'row-reverse',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: active
              ? currentColors.primary
              : operatorPhotos[key] ? currentColors.success : currentColors.border,
            borderRadius: 12,
            padding: 8,
            backgroundColor: currentColors.inputBg,
          }}
        >
          {operatorPhotos[key] ? (
            <Image source={{ uri: operatorPhotos[key] }} style={{ width: 44, height: 44, borderRadius: 8 }} />
          ) : (
            <View style={{ width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: currentColors.background }}>
              <Ionicons name="camera-outline" size={22} color={currentColors.primary} />
            </View>
          )}
          <Text style={{ color: currentColors.text, fontSize: 13, marginRight: 10, flex: 1 }}>
            {operatorPhotos[key] ? `✓ ${label}` : label}
          </Text>
          <Ionicons
            name={active ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={currentColors.textSecondary}
          />
        </TouchableOpacity>

        {active ? (
          <View style={[styles(currentColors).photoSourceBox, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}>
            <Text style={[styles(currentColors).photoSourceTitle, { color: currentColors.text }]}>
              اختر طريقة إضافة {photoSourceLabel || 'الصورة'}
            </Text>
            <View style={styles(currentColors).photoSourceRow}>
              <TouchableOpacity
                style={[styles(currentColors).photoSourceBtn, { backgroundColor: currentColors.primaryLight, borderColor: currentColors.primary }]}
                onPress={() => choosePhotoSource(true)}
              >
                <Ionicons name="camera-outline" size={18} color={currentColors.primary} />
                <Text style={[styles(currentColors).photoSourceBtnText, { color: currentColors.primary }]}>كاميرا</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles(currentColors).photoSourceBtn, { backgroundColor: currentColors.inputBg, borderColor: currentColors.border }]}
                onPress={() => choosePhotoSource(false)}
              >
                <Ionicons name="image-outline" size={18} color={currentColors.text} />
                <Text style={[styles(currentColors).photoSourceBtnText, { color: currentColors.text }]}>استوديو</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles(currentColors).photoSourceCancel}
                onPress={() => {
                  setPhotoSourceKey('');
                  setPhotoSourceLabel('');
                }}
              >
                <Text style={[styles(currentColors).photoSourceCancelText, { color: currentColors.textSecondary }]}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderItem = ({ item }) => {
    if (item.kind === 'operator') {
      const statusLabel = item.status === 'code_ready'
        ? 'كود جاهز'
        : item.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار';
      const opCreatedAt = item.createdAt?.toDate
        ? item.createdAt.toDate().toLocaleDateString('en-GB')
        : (item.createdAt || '---');

      return (
        <View style={[styles(currentColors).card, Shadows.sm]}>
          <View style={styles(currentColors).cardHeader}>
            <Text style={styles(currentColors).operatorTitle}>المشغل: {item.operatorName}</Text>
            <View style={[styles(currentColors).statusBadge, { backgroundColor: currentColors.primary }]}>
              <Text style={styles(currentColors).statusText}>{statusLabel}</Text>
            </View>
          </View>

          <View style={styles(currentColors).infoGrid}>
            <View style={styles(currentColors).infoItem}>
              <Text style={styles(currentColors).infoLabel}>رقم الهاتف</Text>
              <Text style={styles(currentColors).infoValue}>{item.operatorPhone}</Text>
            </View>
            {item.activationCode ? (
              <View style={styles(currentColors).infoItem}>
                <Text style={styles(currentColors).infoLabel}>كود التفعيل</Text>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                  <Text style={styles(currentColors).infoValue}>{item.activationCode}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="نسخ كود التفعيل"
                    onPress={() => copyCode(item.activationCode)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4 }}
                  >
                    <Ionicons name="copy-outline" size={18} color={currentColors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            <View style={styles(currentColors).infoItem}>
              <Text style={styles(currentColors).infoLabel}>صاحب المولدة</Text>
              <Text style={styles(currentColors).infoValue}>{item.ownerName}</Text>
            </View>
            <View style={styles(currentColors).infoItem}>
              <Text style={styles(currentColors).infoLabel}>تاريخ الإضافة</Text>
              <Text style={styles(currentColors).infoValue}>{opCreatedAt}</Text>
            </View>
          </View>

          {!isOperator ? (
            <TouchableOpacity
              style={styles(currentColors).deleteOperatorButton}
              onPress={() => deleteOperator(item)}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles(currentColors).deleteOperatorText}>حذف المشغل</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    const isUsed = item.isUsed || item.used || false;
    const createdAt = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('en-GB') : (item.createdAt || '---');
    const ownerName = item.ownerName || '---';
    const statusText = isUsed
      ? 'مستخدم'
      : item.requestStatus === 'pending'
        ? 'قيد الانتظار'
        : item.requestStatus === 'code_ready'
          ? 'كود جاهز'
          : 'كود التفعيل';
    const statusColor = isUsed
      ? currentColors.error
      : item.requestStatus === 'pending'
        ? currentColors.textSecondary
        : currentColors.success;
    const expiresAtMs = getExpiresAtMs({ expiresAt: item.deviceExpiresAt || item.expiresAt });
    const remainingLabel = item.local
      ? '---'
      : expiresAtMs != null
        ? formatRemainingTime(expiresAtMs - Date.now())
        : 'غير معروف';

    return (
      <View style={[styles(currentColors).card, Shadows.sm]}>
        <View style={styles(currentColors).cardHeader}>
          <View>
            <View style={styles(currentColors).codeTitleRow}>
              <Text style={styles(currentColors).cardTitle}>
                {item.local
                  ? '****'
                  : visibleCodes[item.id] && item.activationCode
                    ? item.activationCode
                    : '****'}
              </Text>
              {!item.local ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={visibleCodes[item.id] ? 'إخفاء الكود' : 'إظهار الكود'}
                  onPress={() => toggleCodeVisibility(item.id)}
                  style={styles(currentColors).eyeButton}
                >
                  <Ionicons
                    name={visibleCodes[item.id] ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={currentColors.primary}
                  />
                </TouchableOpacity>
              ) : null}
              {item.activationCode ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="نسخ كود التفعيل"
                  onPress={() => copyCode(item.activationCode)}
                  style={{ paddingHorizontal: 8 }}
                >
                  <Ionicons name="copy-outline" size={20} color={currentColors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          {!item.local ? (
            <View style={[styles(currentColors).statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles(currentColors).statusText}>{statusText}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles(currentColors).infoGrid}>
          <View style={styles(currentColors).infoItem}>
            <Text style={styles(currentColors).infoLabel}>صاحب المولدة</Text>
            <Text style={styles(currentColors).infoValue}>{ownerName}</Text>
          </View>
          <View style={styles(currentColors).infoItem}>
            <Text style={styles(currentColors).infoLabel}>رقم الهاتف</Text>
            <Text style={styles(currentColors).infoValue}>{item.ownerPhone || '---'}</Text>
          </View>
          <View style={styles(currentColors).infoItem}>
            <Text style={styles(currentColors).infoLabel}>تاريخ الإنشاء</Text>
            <Text style={styles(currentColors).infoValue}>{createdAt}</Text>
          </View>
          <View style={styles(currentColors).infoItem}>
            <Text style={styles(currentColors).infoLabel}>ينتهي الاشتراك بعد</Text>
            <Text style={styles(currentColors).infoValue}>{remainingLabel}</Text>
          </View>
        </View>

      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: currentColors.background }}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[currentColors.primary, currentColors.background]} style={styles(currentColors).header}>
        <TouchableOpacity style={styles(currentColors).backButton} onPress={() => navigation.goBack()}>
          <Ionicons name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'} size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles(currentColors).headerTitle}>{isOperator ? 'بطاقتي' : 'بطاقات التفعيل'}</Text>
        {!isOperator ? (
          <TouchableOpacity style={styles(currentColors).addButton} onPress={() => setOperatorModalVisible(true)}>
            <Ionicons name="add-circle-outline" size={28} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 50 }} color={currentColors.primary} size="large" />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20 }}
          ListEmptyComponent={
            <View style={styles(currentColors).empty}>
              <Ionicons name="card-outline" size={60} color={currentColors.textSecondary} />
              <Text style={{ color: currentColors.textSecondary, marginTop: 10 }}>
                {isOperator ? 'لا توجد بطاقة مرتبطة بهذا الجهاز حالياً' : 'لا يوجد مشغلون أضفتهم حالياً'}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={operatorModalVisible && !isOperator}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPhotoSourceKey('');
          setPhotoSourceLabel('');
          setOperatorModalVisible(false);
        }}
      >
        <View style={styles(currentColors).modalOverlay}>
          <View style={styles(currentColors).modalBox}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles(currentColors).modalTitle}>إضافة مشغل</Text>
            <Text style={styles(currentColors).modalHint}>
              يُرسل الطلب إلى الداشبورد باسم صاحب المولدة
            </Text>

            <TextInput
              style={styles(currentColors).input}
              placeholder="اسم المشغل"
              placeholderTextColor={currentColors.textSecondary}
              value={operatorName}
              onChangeText={setOperatorName}
            />
            <TextInput
              style={styles(currentColors).input}
              placeholder="رقم هاتف المشغل"
              placeholderTextColor={currentColors.textSecondary}
              value={operatorPhone}
              onChangeText={(value) => setOperatorPhone(String(value || '').replace(/\D/g, '').slice(0, 11))}
              keyboardType="phone-pad"
              maxLength={11}
            />

            <Text style={[styles(currentColors).modalHint, { textAlign: 'right', marginBottom: 8 }]}>
              صور بطاقة الموحدة والصورة الشخصية للمشغل
            </Text>
            {renderPhotoPicker('idFront', 'بطاقة الموحدة - الوجه')}
            {renderPhotoPicker('idBack', 'بطاقة الموحدة - الظهر')}
            {renderPhotoPicker('selfie', 'الصورة الشخصية للمشغل')}

            <View style={styles(currentColors).modalActions}>
              <TouchableOpacity
                style={styles(currentColors).modalButton}
                onPress={() => {
                  setPhotoSourceKey('');
                  setPhotoSourceLabel('');
                  setOperatorModalVisible(false);
                }}
              >
                <Text style={styles(currentColors).modalButtonText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles(currentColors).modalButton, styles(currentColors).modalButtonPrimary]}
                onPress={submitOperator}
                disabled={operatorSubmitting}
              >
                <Text style={styles(currentColors).modalButtonPrimaryText}>
                  {operatorSubmitting ? '...' : 'إرسال الطلب'}
                </Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (colors) => StyleSheet.create({
  header: { 
    paddingTop: 60, 
    height: 130, 
    alignItems: 'center', 
    justifyContent: 'center', 
    flexDirection: 'row', 
    paddingHorizontal: 20 
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold',
    fontFamily: Fonts.regular, color: '#fff', flex: 1, textAlign: 'center' },
  backButton: { padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 },
  addButton: { padding: 8 },
  card: { 
    backgroundColor: colors.card, 
    padding: 20, 
    borderRadius: 24, 
    marginBottom: 20, 
    borderWidth: 1, 
    borderColor: colors.border, 
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: colors.success, letterSpacing: 0.3, marginBottom: 4 },
  codeTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 4 },
  eyeButton: { padding: 4, marginRight: 6 },
  cardSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'right' },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  operatorTitle: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 4 },
  deleteOperatorButton: {
    marginTop: 14,
    backgroundColor: colors.error,
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteOperatorText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  infoGrid: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  infoItem: { marginBottom: 12 },
  infoLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
  infoValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  dateText: { fontSize: 11, color: colors.textSecondary, textAlign: 'right' },
  empty: { marginTop: 100, alignItems: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  modalHint: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    textAlign: 'right',
  },
  photoSourceBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  photoSourceTitle: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: Fonts.regular,
    textAlign: 'right',
  },
  photoSourceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  photoSourceBtn: {
    minWidth: 96,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoSourceBtnText: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  photoSourceCancel: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  photoSourceCancelText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.regular,
  },
  modalActions: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 10 },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  modalButtonText: { color: colors.text, fontWeight: '800' },
  modalButtonPrimaryText: { color: '#fff', fontWeight: '900' },
});