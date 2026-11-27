import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, Animated, ScrollView, StatusBar, Vibration, I18nManager, Image, Modal, Keyboard } from 'react-native';
import { saveUser, getTheme } from '../storage';
import { Colors, Shadows, Fonts } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import PhotoSourcePicker from '../components/PhotoSourcePicker';

export default function AddUserScreen({ navigation }) {
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [amperes, setAmperes] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [candidatePhotoUri, setCandidatePhotoUri] = useState('');
  const [isPhotoPreviewVisible, setIsPhotoPreviewVisible] = useState(false);
  const [isPhotoSourceVisible, setIsPhotoSourceVisible] = useState(false);
  const [theme, setTheme] = useState('light');
  const [isLoading, setIsLoading] = useState(true);
  const [bannerConfig, setBannerConfig] = useState({ message: '', type: 'success', visible: false });
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    getTheme().then(t => {
      setTheme(t);
      setIsLoading(false);
    });
  }, []);

  const currentColors = Colors[theme];

  const showBanner = (message, type = 'success') => {
    setBannerConfig({ message, type, visible: true });

    // Quick vibration for feedback
    Vibration.vibrate(Platform.OS === 'android' ? 50 : 10);

    Animated.spring(slideAnim, {
      toValue: 1, // Central pop scale
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

  const pickFromLibrary = async () => {
    Keyboard.dismiss();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showBanner('يرجى السماح بالوصول إلى الاستوديو', 'error');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setCandidatePhotoUri(result.assets[0].uri);
      setIsPhotoPreviewVisible(true);
    }
  };

  const takePhoto = async () => {
    Keyboard.dismiss();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showBanner('يرجى السماح باستخدام الكاميرا', 'error');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setCandidatePhotoUri(result.assets[0].uri);
      setIsPhotoPreviewVisible(true);
    }
  };

  const showPhotoOptions = () => {
    Keyboard.dismiss();
    setIsPhotoSourceVisible(true);
  };

  const choosePhotoSource = (useCamera) => {
    setIsPhotoSourceVisible(false);
    // انتظار إغلاق نافذة الاختيار قبل إقلاع الكاميرا
    setTimeout(() => {
      if (useCamera) takePhoto();
      else pickFromLibrary();
    }, 150);
  };

  const confirmPhoto = () => {
    if (!candidatePhotoUri) return;
    setPhotoUri(candidatePhotoUri);
    setCandidatePhotoUri('');
    setIsPhotoPreviewVisible(false);
  };

  const cancelPhotoPreview = () => {
    setCandidatePhotoUri('');
    setIsPhotoPreviewVisible(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showBanner('اسم المشترك مطلوب', 'error');
      return;
    }

    if (!nickname.trim()) {
      showBanner('اللقب مطلوب', 'error');
      return;
    }

    if (!amperes.trim()) {
      showBanner('عدد الأمبيرات مطلوب', 'error');
      return;
    }

    if (isNaN(amperes) || parseFloat(amperes) <= 0) {
      showBanner('يرجى إدخال عدد أمبيرات صحيح', 'error');
      return;
    }

    const newUser = {
      name: name.trim(),
      nickname: nickname.trim(),
      amperes: parseFloat(amperes),
      photoUri: photoUri || null,
    };

    await saveUser(newUser);
    // Note: We are using standard Alert here as this is a new screen navigation away
    Alert.alert('نجاح', 'تم إضافة المشترك بنجاح');
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  if (isLoading) return <View style={{ flex: 1, backgroundColor: currentColors.background }} />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles(currentColors).container, { backgroundColor: currentColors.background }]}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <StatusBar barStyle="light-content" />

      <Animated.View 
        pointerEvents={bannerConfig.visible ? 'auto' : 'none'}
        style={[
          styles(currentColors).banner, 
          { 
            backgroundColor: bannerConfig.type === 'success' ? currentColors.success : currentColors.error, 
            transform: [{ scale: slideAnim }],
            opacity: slideAnim
          }
        ]}
      >
        <Text style={styles(currentColors).bannerText}>{bannerConfig.message}</Text>
      </Animated.View>

      <LinearGradient
        colors={[currentColors.primary, currentColors.background]}
        style={styles(currentColors).headerGradient}
      >
        <Text style={styles(currentColors).title}>إضافة مشترك جديد</Text>
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

      <ScrollView contentContainerStyle={styles(currentColors).scrollContainer} keyboardShouldPersistTaps="handled">

        <View style={[styles(currentColors).card, Shadows.md]}>
          <View style={styles(currentColors).photoSection}>
            <TouchableOpacity
              style={styles(currentColors).photoPicker}
              onPress={showPhotoOptions}
              activeOpacity={0.85}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles(currentColors).photoPreview} />
              ) : (
                <View style={styles(currentColors).photoPlaceholder}>
                  <Ionicons name="person-outline" size={34} color={currentColors.textSecondary} />
                </View>
              )}
              <View style={styles(currentColors).photoCameraBadge}>
                <Ionicons name="camera" size={16} color="#ffffff" />
              </View>
            </TouchableOpacity>
            <Text style={styles(currentColors).photoLabel}>صورة المشترك</Text>
            <Text style={styles(currentColors).photoOptional}>اختياري - الاستوديو أو الكاميرا</Text>
          </View>

          <Text style={styles(currentColors).label}>اسم المشترك <Text style={styles(currentColors).requiredMark}>*</Text></Text>
          <TextInput
            style={[styles(currentColors).input, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
            value={name}
            onChangeText={setName}
            placeholder="مثال: أحمد محمد"
            placeholderTextColor={currentColors.textSecondary}
            textAlign="right"
            cursorColor="#ef4444"
            selectionColor="#ef4444"
          />

          <Text style={[styles(currentColors).label, { marginTop: 15 }]}>اللقب (مثال: أبو فلان) <Text style={styles(currentColors).requiredMark}>*</Text></Text>
          <TextInput
            style={[styles(currentColors).input, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
            value={nickname}
            onChangeText={setNickname}
            placeholder="اللقب أو الكنية"
            placeholderTextColor={currentColors.textSecondary}
            textAlign="right"
            cursorColor="#ef4444"
            selectionColor="#ef4444"
          />

          <Text style={[styles(currentColors).label, { marginTop: 25 }]}>عدد الأمبيرات <Text style={styles(currentColors).requiredMark}>*</Text></Text>
          <TextInput
            style={[styles(currentColors).input, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
            value={amperes}
            onChangeText={setAmperes}
            keyboardType="numeric"
            placeholder="مثال: 5"
            placeholderTextColor={currentColors.textSecondary}
            textAlign="center"
            cursorColor="#ef4444"
            selectionColor="#ef4444"
          />

          <TouchableOpacity style={[styles(currentColors).button, Shadows.sm]} onPress={handleSave}>
            <Text style={styles(currentColors).buttonText}>إضافة المشترك</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PhotoSourcePicker
        visible={isPhotoSourceVisible}
        title="صورة المشترك"
        theme={theme}
        onCamera={() => choosePhotoSource(true)}
        onGallery={() => choosePhotoSource(false)}
        onCancel={() => setIsPhotoSourceVisible(false)}
      />

      <Modal
        visible={isPhotoPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelPhotoPreview}
      >
        <View style={styles(currentColors).photoPreviewOverlay}>
          <View style={styles(currentColors).photoPreviewCard}>
            <Text style={styles(currentColors).photoPreviewTitle}>معاينة الصورة</Text>
            <Image
              source={{ uri: candidatePhotoUri }}
              style={styles(currentColors).photoPreviewLarge}
              resizeMode="cover"
            />
            <View style={styles(currentColors).photoPreviewActions}>
              <TouchableOpacity
                style={styles(currentColors).photoCancelButton}
                onPress={cancelPhotoPreview}
              >
                <Ionicons name="close" size={22} color={currentColors.text} />
                <Text style={styles(currentColors).photoCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles(currentColors).photoConfirmButton}
                onPress={confirmPhoto}
              >
                <Ionicons name="checkmark" size={24} color="#ffffff" />
                <Text style={styles(currentColors).photoConfirmText}>حفظ الصورة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  headerGradient: {
    paddingTop: 110, // Raised from 160
    paddingBottom: 60,
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
    fontSize: 28, // Scaled up
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: '#ffffff',
    textAlign: 'center',
    width: '100%',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 25,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 22,
  },
  photoPicker: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 4,
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCameraBadge: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.card,
  },
  photoLabel: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  photoOptional: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 20, // Scaled up
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.text,
    marginBottom: 10,
    textAlign: 'right',
  },
  requiredMark: {
    color: colors.error,
  },
  photoPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  photoPreviewCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  photoPreviewTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 14,
  },
  photoPreviewLarge: {
    width: '100%',
    height: 330,
    borderRadius: 18,
    backgroundColor: colors.inputBg,
  },
  photoPreviewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  photoCancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoCancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  photoConfirmButton: {
    flex: 1.35,
    height: 52,
    borderRadius: 15,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoConfirmText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  input: {
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    minHeight: 65, // Increased slightly for font
    fontSize: 22, // Scaled up
    borderWidth: 1,
    borderColor: colors.border,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  button: {
    backgroundColor: colors.success,
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 25,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 22, // Scaled up
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
  banner: {
    position: 'absolute',
    top: 210, // Unified position for all screens
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
    backgroundColor: '#312e81', // Unified Indigo Color
  },
  bannerText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    fontSize: 16,
    textAlign: 'center',
  },
});
