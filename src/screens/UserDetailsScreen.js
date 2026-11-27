import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, Platform, Animated, Modal, KeyboardAvoidingView, StatusBar, Vibration, I18nManager, Image, Keyboard } from 'react-native';
import * as Print from 'expo-print';
import { addPayment, deleteUser, getAppPin, getTheme, updateUser } from '../storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Shadows, Fonts } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import PhotoSourcePicker from '../components/PhotoSourcePicker';

export default function UserDetailsScreen({ route, navigation }) {
  const { user, amperePrice } = route.params;

  const [currentUser, setCurrentUser] = useState(user);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [theme, setTheme] = useState('light');
  const [generatorOwnerName, setGeneratorOwnerName] = useState('');

  const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
  const [isPrintModalVisible, setPrintModalVisible] = useState(false);
  const [deletePinInput, setDeletePinInput] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [appPin, setAppPin] = useState(null);
  const [printSize, setPrintSize] = useState('large');
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [isPhotoSourceVisible, setIsPhotoSourceVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editAmperes, setEditAmperes] = useState('');
  const [editPhotoUri, setEditPhotoUri] = useState('');

  useEffect(() => {
    getAppPin().then(pin => setAppPin(pin));
    getTheme().then(t => setTheme(t));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('@generator_owner_name')
      .then((v) => setGeneratorOwnerName(v || ''))
      .catch(() => setGeneratorOwnerName(''));
  }, []);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const [bannerConfig, setBannerConfig] = useState({ message: '', type: 'success', visible: false });

  const currentColors = Colors[theme];

  const triggerBanner = (message, type = 'success') => {
    setBannerConfig({ message, type, visible: true });

    // Haptic feedback
    Vibration.vibrate(Platform.OS === 'android' ? 50 : 10);

    Animated.spring(slideAnim, {
      toValue: 1, 
      useNativeDriver: true,
      tension: 110,
      friction: 10,
    }).start();

    setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setBannerConfig(prev => ({ ...prev, visible: false })));
    }, 2000);
  };

  const totalDue = currentUser.amperes * amperePrice;
  const totalPaid = (currentUser.payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const remaining = totalDue - totalPaid;

  const handlePaymentChange = (text) => {
    const numericValue = text.replace(/[^0-9]/g, '').slice(0, 9);
    setPaymentAmount(numericValue);
  };
  const formattedPaymentAmount = paymentAmount
    ? paymentAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : '';

  const openEditModal = () => {
    Vibration.vibrate(Platform.OS === 'android' ? 45 : 12);
    setEditName(currentUser.name || '');
    setEditNickname(currentUser.nickname || '');
    setEditAmperes(currentUser.amperes?.toString() || '');
    setEditPhotoUri(currentUser.photoUri || '');
    setEditModalVisible(true);
  };

  const pickEditPhoto = async (fromCamera) => {
    Keyboard.dismiss();
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      triggerBanner(fromCamera ? 'يرجى السماح باستخدام الكاميرا' : 'يرجى السماح بالوصول إلى الاستوديو', 'error');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });

    if (!result.canceled && result.assets?.[0]) {
      setEditPhotoUri(result.assets[0].uri);
    }
  };

  const showEditPhotoOptions = () => {
    Keyboard.dismiss();
    setIsPhotoSourceVisible(true);
  };

  const chooseEditPhotoSource = (useCamera) => {
    setIsPhotoSourceVisible(false);
    // انتظار إغلاق نافذة الاختيار قبل إقلاع الكاميرا
    setTimeout(() => pickEditPhoto(useCamera), 150);
  };

  const saveUserEdit = async () => {
    if (!editName.trim()) {
      triggerBanner('اسم المشترك مطلوب', 'error');
      return;
    }
    if (!editNickname.trim()) {
      triggerBanner('اللقب مطلوب', 'error');
      return;
    }
    if (!editAmperes.trim() || isNaN(editAmperes) || parseFloat(editAmperes) <= 0) {
      triggerBanner('يرجى إدخال عدد أمبيرات صحيح', 'error');
      return;
    }

    const updatedUser = {
      ...currentUser,
      name: editName.trim(),
      nickname: editNickname.trim(),
      amperes: parseFloat(editAmperes),
      photoUri: editPhotoUri || null,
    };

    await updateUser(updatedUser);
    setCurrentUser(updatedUser);
    setEditModalVisible(false);
    triggerBanner('تم تعديل بيانات المشترك', 'success');
  };

  const handlePay = async () => {
    if (!paymentAmount || isNaN(paymentAmount) || parseFloat(paymentAmount) <= 0) {
      triggerBanner('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }

    if (parseFloat(paymentAmount) > remaining) {
      triggerBanner('المبلغ المدخل أكبر من المبلغ المتبقي', 'error');
      return;
    }

    processPayment();
  };

  const processPayment = async () => {
    const updatedUser = await addPayment(currentUser.id, parseFloat(paymentAmount));
    if (updatedUser) {
      setCurrentUser(updatedUser);
      setPaymentAmount('');
      triggerBanner('تم تسجيل الدفعة بنجاح', 'success');
    }
  };

  const executeDelete = () => {
    Alert.alert(
      'حذف المشترك',
      `هل أنت متأكد من حذف ${currentUser.name}؟ لا يمكن التراجع عن هذا الإجراء.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف', style: 'destructive', onPress: async () => {
            await deleteUser(currentUser.id);
            if (navigation.canGoBack()) {
              navigation.goBack();
            }
          }
        }
      ]
    );
  };

  const handleDelete = () => {
    setDeletePinInput('');
    setDeleteModalVisible(true);
  };

  const handleConfirmDeleteWithPin = async () => {
    // التحقق من البصمة أولاً إذا كانت مفعلة
    const bioEnabled = await AsyncStorage.getItem('@biometrics_enabled');
    if (bioEnabled === 'true') {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'تأكيد الهوية لإتمام عملية الحذف',
        cancelLabel: 'إلغاء',
        disableDeviceFallback: false,
      });

      if (result.success) {
        performActualDeletion();
        return;
      } else {
        // في حال فشل البصمة أو إلغائها، نستمر لطلب الرمز اليدوي
        triggerBanner('فشل التحقق من البصمة، يرجى استخدام الرمز', 'error');
      }
    }

    // If a PIN is set in settings, we MUST verify it
    if (appPin) {
      if (deletePinInput === appPin) {
        performActualDeletion();
      } else {
        Vibration.vibrate(200);
        triggerBanner('رمز الحماية غير صحيح', 'error');
      }
    } else {
      // If no PIN is set, we still show the modal for confirmation, but don't check PIN
      performActualDeletion();
    }
  };

  const performActualDeletion = async () => {
    setDeleteModalVisible(false);
    setTimeout(async () => {
      await deleteUser(currentUser.id);
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    }, 300);
  };

  const handlePrint = () => {
    setPrintModalVisible(true);
  };

  const executePrint = async () => {
    setPrintModalVisible(false);
    try {
      const fontSizeScale = printSize === 'small' ? '0.75' : printSize === 'medium' ? '0.88' : '1';
      const padding = printSize === 'small' ? '12px' : '24px';
      const html = `
        <html dir="rtl" lang="ar">
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: ${padding}; color: #000; line-height: 1.2; font-size: calc(16px * ${fontSizeScale}); }
            .container { max-width: 100%; margin: 0 auto; border: 1px solid #000; padding: ${padding}; border-radius: 5px; direction: rtl; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
            .title { font-size: calc(24px * ${fontSizeScale}); font-weight: bold; color: #000; margin-bottom: 2px; }
            .details { font-size: calc(18px * ${fontSizeScale}); }
            .row { display: flex; justify-content: space-between; border-bottom: 1px solid #ccc; padding: 5px 0; }
            .label { color: #000; }
            .value { font-weight: bold; color: #000; }
            .total-row { background: #fff; padding: 10px; margin-top: 10px; border: 1px solid #000; border-radius: 5px; }
            .footer { text-align: center; margin-top: 15px; font-size: calc(12px * ${fontSizeScale}); color: #000; border-top: 1px solid #000; padding-top: 5px; }
            .amount-due { font-size: calc(22px * ${fontSizeScale}); color: #000; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="title">وصل اشتراك أمبيرك</div>
              <div style="font-size: 0.8em;">تاريخ: ${new Date().toLocaleDateString('ar-IQ')}</div>
            </div>
            
            <div class="details">
              ${generatorOwnerName ? `
              <div class="row">
                <span class="label">صاحب المولدة:</span>
                <span class="value">${generatorOwnerName}</span>
              </div>` : ''}
              <div class="row">
                <span class="label">المشترك:</span>
                <span class="value">${currentUser.name}${currentUser.nickname ? ` (${currentUser.nickname})` : ''}</span>
              </div>
              <div class="row">
                <span class="label">الأمبيرات:</span>
                <span class="value">${currentUser.amperes}</span>
              </div>
              
              <div class="total-row">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span class="label">كلي:</span>
                  <span class="value">${totalDue.toLocaleString('en-US')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span class="label">واصل:</span>
                  <span class="value">${totalPaid.toLocaleString('en-US')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px dashed #000; padding-top: 8px;">
                  <span class="label">المتبقي:</span>
                  <span class="amount-due">${remaining.toLocaleString('en-US')} د.ع</span>
                </div>
              </div>
            </div>
            <div class="footer">
              شكراً لالتزامكم بالدفع. تم إصدار هذا الوصل آلياً.
            </div>
          </div>
        </body>
        </html>
      `;

      await Print.printAsync({ html });
    } catch (error) {
      console.error('Print receipt error:', error?.message || error);
      triggerBanner('تعذر إنشاء الوصل PDF', 'error');
    }
  };

  const getBannerStyle = () => {
    if (bannerConfig.type === 'success') return { backgroundColor: currentColors.success, color: '#ffffff' };
    return { backgroundColor: currentColors.error, color: '#ffffff' };
  };

  const bannerTheme = getBannerStyle();

  return (
    <View style={{ flex: 1, backgroundColor: currentColors.background }}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[currentColors.primary, currentColors.background]}
        style={styles(currentColors).headerGradient}
      >
        <Text style={styles(currentColors).title}>تفاصيل المشترك</Text>
        <TouchableOpacity 
          style={styles(currentColors).backButton} 
          onPress={() => navigation.canGoBack() && navigation.goBack()}
        >
          <Ionicons 
            name={I18nManager.isRTL ? "chevron-forward" : "chevron-back"} 
            size={28} 
            color="#ffffff" 
          />
        </TouchableOpacity>
      </LinearGradient>

      <Animated.View 
        pointerEvents={bannerConfig.visible ? 'auto' : 'none'}
        style={[
          styles(currentColors).banner, 
          { 
            backgroundColor: '#312e81', // Unified Color
            transform: [{ scale: slideAnim }],
            opacity: slideAnim
          }
        ]}
      >
        <Text style={styles(currentColors).bannerText}>{bannerConfig.message}</Text>
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView style={styles(currentColors).container} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Compact Profile Header */}
          <View style={styles(currentColors).compactProfile}>
              {currentUser.photoUri ? (
                <Image source={{ uri: currentUser.photoUri }} style={styles(currentColors).avatarImage} />
              ) : (
                <View style={styles(currentColors).avatarCircle}>
                  <Text style={styles(currentColors).avatarText}>{currentUser.name.charAt(0)}</Text>
                </View>
              )}
            <View style={styles(currentColors).nameContainer}>
              <Text style={styles(currentColors).compactName}>{currentUser.name}</Text>
              {currentUser.nickname ? <Text style={styles(currentColors).compactNickname}>{currentUser.nickname}</Text> : null}
            </View>
            <View style={styles(currentColors).compactBadge}>
              <Text style={styles(currentColors).compactBadgeText}>{currentUser.amperes}A</Text>
            </View>
            <TouchableOpacity
              style={styles(currentColors).editProfileButton}
              onPress={() => {
                Vibration.vibrate(Platform.OS === 'android' ? 25 : 8);
                openEditModal();
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="create-outline" size={20} color={currentColors.primary} />
            </TouchableOpacity>
          </View>

          {/* Mini-Stats Dashboard */}
          <View style={styles(currentColors).statsDashboard}>
            <View style={[styles(currentColors).miniStat, Shadows.sm]}>
              <Text style={styles(currentColors).miniStatLabel}>المبلغ الكلي</Text>
              <Text style={styles(currentColors).miniStatValue}>{totalDue.toLocaleString('en-US')}</Text>
            </View>
            <View style={[styles(currentColors).miniStat, Shadows.sm]}>
              <Text style={styles(currentColors).miniStatLabel}>الواصل</Text>
              <Text style={[styles(currentColors).miniStatValue, { color: currentColors.success }]}>{totalPaid.toLocaleString('en-US')}</Text>
            </View>
            <View style={[styles(currentColors).miniStat, { backgroundColor: remaining > 0 ? '#fee2e2' : '#dcfce7' }, Shadows.sm]}>
              <Text style={[styles(currentColors).miniStatLabel, { color: remaining > 0 ? '#991b1b' : '#166534' }]}>المتبقي</Text>
              <Text style={[styles(currentColors).miniStatValue, { color: remaining > 0 ? '#b91c1c' : '#15803d' }]}>{remaining.toLocaleString('en-US')}</Text>
            </View>
          </View>

          {/* Inline Payment Row */}
          {remaining > 0 && (
            <View style={[styles(currentColors).compactPaymentCard, Shadows.sm]}>
              <Text style={styles(currentColors).compactSectionTitle}>تسديد دفعة</Text>
              <View style={styles(currentColors).inlinePaymentRow}>
                <TextInput
                  style={[styles(currentColors).inlineInput, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
                  value={formattedPaymentAmount}
                  onChangeText={handlePaymentChange}
                  keyboardType="numeric"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="المبلغ..."
                  placeholderTextColor={currentColors.textSecondary}
                  textAlign="left"
                />
                <TouchableOpacity style={styles(currentColors).inlinePayButton} onPress={handlePay}>
                  <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                  <Text style={styles(currentColors).inlinePayButtonText}>تأكيد</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Compact Actions */}
          <View style={styles(currentColors).compactActionsRow}>
            <TouchableOpacity style={[styles(currentColors).compactActionBtn, { backgroundColor: currentColors.success }, Shadows.sm]} onPress={handlePrint}>
              <Ionicons name="print-outline" size={20} color="#ffffff" style={{ marginLeft: 8 }} />
              <Text style={styles(currentColors).compactActionText}>طباعة الوصل</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles(currentColors).compactActionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: currentColors.error }]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={currentColors.error} style={{ marginLeft: 8 }} />
              <Text style={[styles(currentColors).compactActionText, { color: currentColors.error }]}>حذف</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles(currentColors).modalOverlay}
        >
          <View style={[styles(currentColors).editModalContainer, { backgroundColor: currentColors.card }]}>
            <Text style={styles(currentColors).editModalTitle}>تعديل بيانات المشترك</Text>

            <TouchableOpacity
              style={styles(currentColors).editPhotoPicker}
              onPress={showEditPhotoOptions}
              activeOpacity={0.85}
            >
              {editPhotoUri ? (
                <Image source={{ uri: editPhotoUri }} style={styles(currentColors).editPhotoImage} />
              ) : (
                <View style={styles(currentColors).editPhotoPlaceholder}>
                  <Ionicons name="person-outline" size={32} color={currentColors.textSecondary} />
                </View>
              )}
              <View style={styles(currentColors).editPhotoBadge}>
                <Ionicons name="camera" size={15} color="#ffffff" />
              </View>
            </TouchableOpacity>

            <Text style={styles(currentColors).editLabel}>اسم المشترك *</Text>
            <TextInput
              style={[styles(currentColors).editInput, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
              value={editName}
              onChangeText={setEditName}
              textAlign="right"
              placeholder="اسم المشترك"
              placeholderTextColor={currentColors.textSecondary}
            />

            <Text style={styles(currentColors).editLabel}>اللقب *</Text>
            <TextInput
              style={[styles(currentColors).editInput, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
              value={editNickname}
              onChangeText={setEditNickname}
              textAlign="right"
              placeholder="اللقب"
              placeholderTextColor={currentColors.textSecondary}
            />

            <Text style={styles(currentColors).editLabel}>عدد الأمبيرات *</Text>
            <TextInput
              style={[styles(currentColors).editInput, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
              value={editAmperes}
              onChangeText={setEditAmperes}
              keyboardType="numeric"
              textAlign="center"
              placeholder="عدد الأمبيرات"
              placeholderTextColor={currentColors.textSecondary}
            />

            <View style={styles(currentColors).modalActions}>
              <TouchableOpacity
                style={[styles(currentColors).modalCancel, { backgroundColor: currentColors.inputBg }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={[styles(currentColors).modalCancelText, { color: currentColors.text }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles(currentColors).modalSave, { backgroundColor: currentColors.primary }]}
                onPress={saveUserEdit}
              >
                <Ionicons name="checkmark" size={18} color="#ffffff" />
                <Text style={styles(currentColors).modalSaveText}>حفظ التعديلات</Text>
              </TouchableOpacity>
            </View>
          </View>

          <PhotoSourcePicker
            visible={isPhotoSourceVisible}
            title="تعديل الصورة"
            theme={theme}
            onCamera={() => chooseEditPhotoSource(true)}
            onGallery={() => chooseEditPhotoSource(false)}
            onCancel={() => setIsPhotoSourceVisible(false)}
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Secure Deletion Modal */}
      <Modal visible={isDeleteModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles(currentColors).modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={[styles(currentColors).modalContainer, { backgroundColor: currentColors.card, borderTopColor: currentColors.error, borderTopWidth: 5 }]}>
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <Ionicons name="alert-circle" size={50} color={currentColors.error} />
              <Text style={[styles(currentColors).modalTitle, { color: currentColors.error, marginTop: 10 }]}>تأكيد الحذف النهائي</Text>
            </View>

            <Text style={{ textAlign: 'center', marginBottom: 20, color: currentColors.text, fontSize: 16, fontWeight: '500' }}>
              هل أنت متأكد من حذف <Text style={{ fontWeight: 'bold',
    fontFamily: Fonts.regular, color: currentColors.primary }}>{currentUser.name}</Text>؟
              {'\n'}هذا الإجراء سيقوم بمسح كافة البيانات والوصولات السابقة ولا يمكن التراجع عنه.
            </Text>

            {appPin ? (
              <>
                <Text style={{ textAlign: 'center', marginBottom: 10, color: currentColors.textSecondary }}>يرجى إدخال رمز الحماية للمتابعة:</Text>
                <TextInput
                  style={[styles(currentColors).modalInput, { backgroundColor: currentColors.inputBg, color: currentColors.text, borderColor: currentColors.error }]}
                  value={deletePinInput}
                  onChangeText={setDeletePinInput}
                  keyboardType="number-pad"
                  textAlign="center"
                  secureTextEntry={true} // Hide PIN
                  placeholder="****"
                  placeholderTextColor={currentColors.textSecondary}
                  selectTextOnFocus={true}
                  autoFocus={true}
                />
              </>
            ) : null}

            <View style={styles(currentColors).modalActions}>
              <TouchableOpacity style={[styles(currentColors).modalCancel, { backgroundColor: currentColors.inputBg }]} onPress={() => setDeleteModalVisible(false)}>
                <Text style={[styles(currentColors).modalCancelText, { color: currentColors.text }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles(currentColors).modalSave, { backgroundColor: currentColors.error }]} onPress={handleConfirmDeleteWithPin}>
                <Ionicons name="trash-outline" size={18} color="#ffffff" style={{ marginLeft: 8 }} />
                <Text style={styles(currentColors).modalSaveText}>تأكيد الحذف</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modern Print Confirmation Modal */}
      <Modal visible={isPrintModalVisible} transparent={true} animationType="fade">
        <View style={styles(currentColors).modalOverlay}>
          <View style={[styles(currentColors).modalContainer, { backgroundColor: currentColors.card, borderTopColor: currentColors.primary, borderTopWidth: 5 }]}>
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <Ionicons name="print-outline" size={50} color={currentColors.primary} />
              <Text style={[styles(currentColors).modalTitle, { color: currentColors.primary, marginTop: 10 }]}>تأكيد طباعة الوصل</Text>
            </View>

            <Text style={{ textAlign: 'center', marginBottom: 25, color: currentColors.text, fontSize: 16, fontWeight: '500', lineHeight: 24 }}>
              هل ترغب في طباعة الوصل المالي الخاص بالمشترك {'\n'}
              <Text style={{ fontWeight: 'bold',
    fontFamily: Fonts.regular, color: currentColors.primary }}>{currentUser.name}</Text>؟
            </Text>

            <View style={styles(currentColors).modalActions}>
              <TouchableOpacity style={[styles(currentColors).modalCancel, { backgroundColor: currentColors.inputBg }]} onPress={() => setPrintModalVisible(false)}>
                <Text style={[styles(currentColors).modalCancelText, { color: currentColors.text }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles(currentColors).modalSave, { backgroundColor: currentColors.primary }]} onPress={executePrint}>
                <Ionicons name="print" size={18} color="#ffffff" style={{ marginLeft: 8 }} />
                <Text style={styles(currentColors).modalSaveText}>طباعة الوصل</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  headerGradient: {
    paddingTop: 110,
    paddingBottom: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 110,
    [I18nManager.isRTL ? 'right' : 'left']: 20,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    zIndex: 10,
  },
  title: {
    fontSize: 28, // Scaled for all app
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: '#ffffff',
    textAlign: 'center',
    width: '100%',
  },
  banner: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 50,
    zIndex: 9999,
    elevation: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    minWidth: 140,
    backgroundColor: '#312e81',
  },
  bannerText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    fontSize: 18, // Scaled for all app
    textAlign: 'center',
  },
  compactProfile: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 25,
    paddingHorizontal: 10,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#312e81',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 15,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginLeft: 15,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 28, // Increased from 24
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
  nameContainer: {
    flex: 1,
    alignItems: 'flex-start',
    textAlign: 'right',
  },
  compactName: {
    fontSize: 24, // Increased from 22
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.text,
    textAlign: 'right',
  },
  compactNickname: {
    fontSize: 18, // Scaled up
    color: colors.textSecondary,
    textAlign: 'right',
  },
  compactBadge: {
    backgroundColor: 'rgba(49, 46, 129, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  compactBadgeText: {
    color: '#312e81',
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    fontSize: 18, // Scaled up
  },
  editProfileButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 8,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalContainer: {
    width: '92%',
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  editModalTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 14,
  },
  editPhotoPicker: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignSelf: 'center',
    marginBottom: 14,
  },
  editPhotoImage: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  editPhotoPlaceholder: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  editPhotoBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.card,
  },
  editLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 6,
  },
  editInput: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '700',
  },
  statsDashboard: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 25,
  },
  miniStat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 15,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniStatLabel: {
    fontSize: 15, // Scaled up
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
  miniStatValue: {
    fontSize: 19, // Scaled up
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.text,
  },
  compactPaymentCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 15,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactSectionTitle: {
    fontSize: 18, // Scaled up
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.textSecondary,
    marginBottom: 12,
    textAlign: 'right',
  },
  inlinePaymentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  inlineInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 60, // Refined for large font
    fontSize: 22, // Scaled up
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inlinePayButton: {
    backgroundColor: '#312e81',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 15,
    height: 60, // Matched
    borderRadius: 12,
    gap: 5,
  },
  inlinePayButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    fontSize: 18, // Scaled up
  },
  compactActionsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 10,
  },
  compactActionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60, // Matched
    borderRadius: 15,
  },
  compactActionText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    fontSize: 18, // Scaled up
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '90%',
    borderRadius: 25,
    padding: 25,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    textAlign: 'center',
  },
  modalInput: {
    borderRadius: 15,
    paddingHorizontal: 15,
    height: 60,
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  modalActions: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancel: {
    flex: 1,
    height: 55,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  modalSave: {
    flex: 2,
    height: 55,
    borderRadius: 15,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalCancelText: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
  modalSaveText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
});
