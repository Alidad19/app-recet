import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Animated, ScrollView, StatusBar, I18nManager } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { getAmperePrice, getUsers, setAmperePrice, setUsers, getTheme, setTheme as saveTheme, getOperatorOwnerName } from '../storage';
import { fetchSharedOwnerData, publishSharedOwnerData } from '../ownerDataSync';
import {
  configureGoogleSignIn,
  downloadOwnerAccount,
  isGoogleUser,
  isGoogleSignInAvailable,
  signInWithGoogleAccount,
  signOutGoogleAccount,
  uploadOwnerAccount,
  watchAuth,
} from '../account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRole, isOperator as hasOperatorRole } from '../RoleContext';
import { Colors, Shadows, Fonts } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen({ navigation }) {
  const role = useRole();
  const isOperator = hasOperatorRole(role);
  const isFocused = useIsFocused();

  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [theme, setTheme] = useState('light');
  const [originalTheme, setOriginalTheme] = useState('light');
  const [ownerName, setOwnerName] = useState('');
  const [originalOwnerName, setOriginalOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [originalOwnerPhone, setOriginalOwnerPhone] = useState('');
  const [operatorOwnerName, setOperatorOwnerName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [accountUser, setAccountUser] = useState(null);
  const [accountBusy, setAccountBusy] = useState(false);

  const [bannerConfig, setBannerConfig] = useState({ message: '', type: 'warning' });
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    loadSettings();
  }, [isFocused, isOperator]);

  useEffect(() => {
    configureGoogleSignIn();
    return watchAuth((user) => setAccountUser(user));
  }, []);

  const loadSettings = async () => {
    const [currentPrice, currentTheme, savedName, savedPhone, ownerDisplayName] = await Promise.all([
      getAmperePrice(),
      getTheme(),
      AsyncStorage.getItem('@generator_owner_name'),
      AsyncStorage.getItem('@generator_owner_phone'),
      getOperatorOwnerName(),
    ]);

    let priceToShow = currentPrice;
    if (isOperator) {
      const shared = await fetchSharedOwnerData();
      if (shared.amperePrice > 0) {
        priceToShow = shared.amperePrice;
        await setAmperePrice(shared.amperePrice);
      }
    }

    const priceStr = priceToShow ? priceToShow.toString() : '';
    setPrice(priceStr);
    setOriginalPrice(priceStr);

    setTheme(currentTheme);
    setOriginalTheme(currentTheme);

    setOwnerName(savedName || '');
    setOriginalOwnerName(savedName || '');
    setOwnerPhone(savedPhone || '');
    setOriginalOwnerPhone(savedPhone || '');
    setOperatorOwnerName(ownerDisplayName || '');

    setIsLoading(false);
  };

  const currentColors = Colors[theme];

  const handlePriceChange = (text) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    setPrice(numericValue);
  };

  const triggerBanner = (message, type = 'warning', callback = null) => {
    setBannerConfig({ message, type, visible: true });
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 110,
      friction: 10,
    }).start(() => {
      setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setBannerConfig(prev => ({ ...prev, visible: false }));
          if (callback) callback();
        });
      }, 1500);
    });
  };

  const applyRemoteAccount = async (data) => {
    if (!data) return false;

    const remotePrice = Number(data.amperePrice || 0);
    const remoteTheme = data.theme || 'light';
    const remoteName = String(data.name || '');
    const remotePhone = String(data.phone || '');
    const remoteUsers = Array.isArray(data.users) ? data.users : [];

    if (remotePrice > 0) {
      await setAmperePrice(remotePrice);
      setPrice(remotePrice.toString());
      setOriginalPrice(remotePrice.toString());
    }
    await saveTheme(remoteTheme);
    setTheme(remoteTheme);
    setOriginalTheme(remoteTheme);
    await setUsers(remoteUsers);

    if (remoteName) {
      await AsyncStorage.setItem('@generator_owner_name', remoteName);
      setOwnerName(remoteName);
      setOriginalOwnerName(remoteName);
    }
    if (remotePhone) {
      await AsyncStorage.setItem('@generator_owner_phone', remotePhone);
      setOwnerPhone(remotePhone);
      setOriginalOwnerPhone(remotePhone);
    }
    return true;
  };

  const handleGoogleSignIn = async () => {
    if (isOperator || accountBusy) return;
    setAccountBusy(true);
    try {
      const user = await signInWithGoogleAccount();
      const remote = await downloadOwnerAccount();
      const restored = await applyRemoteAccount(remote);

      if (!restored) {
        await uploadOwnerAccount({
          name: ownerName,
          phone: ownerPhone,
          amperePrice: parseFloat(price) || 0,
          theme,
          users: await getUsers(),
        });
      }
      setAccountUser(user);
      triggerBanner('تم ربط البيانات بحساب Gmail بنجاح', 'success');
    } catch (e) {
      triggerBanner(e?.message || 'تعذر تسجيل الدخول بـ Gmail', 'error');
    } finally {
      setAccountBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      await signOutGoogleAccount();
      setAccountUser(null);
      triggerBanner('تم تسجيل الخروج من Gmail', 'success');
    } catch {
      triggerBanner('تعذر تسجيل الخروج', 'error');
    } finally {
      setAccountBusy(false);
    }
  };

  const handleSave = async () => {
    const identityUnchanged =
      isOperator ||
      (ownerName === originalOwnerName && ownerPhone === originalOwnerPhone);

    if (price === originalPrice && theme === originalTheme && identityUnchanged) {
      triggerBanner('لم تقم بتغيير شيء', 'warning');
      return;
    }

    if (!price || isNaN(price) || parseFloat(price) <= 0) {
      triggerBanner('يرجى إدخال سعر صحيح للأمبير', 'error');
      return;
    }

    if (!isOperator && ownerPhone.trim().length !== 11) {
      triggerBanner('يجب أن يتكون رقم الهاتف من 11 رقم بالضبط', 'error');
      return;
    }

    await setAmperePrice(parseFloat(price));
    await saveTheme(theme);

    if (!isOperator) {
      const currentUsers = await getUsers();
      await AsyncStorage.setItem('@generator_owner_name', ownerName.trim());
      await AsyncStorage.setItem('@generator_owner_phone', ownerPhone.trim());
      await publishSharedOwnerData({
        amperePrice: parseFloat(price),
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        users: currentUsers,
      });

      if (isGoogleUser(accountUser)) {
        await uploadOwnerAccount({
          name: ownerName.trim(),
          phone: ownerPhone.trim(),
          amperePrice: parseFloat(price),
          theme,
          users: currentUsers,
        });
      }
    }

    triggerBanner('تم حفظ الإعدادات بنجاح', 'success', () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    });
  };

  if (isLoading) return <View style={[styles(currentColors).container, { backgroundColor: currentColors.background }]} />;

  const displayPrice = price ? Number(price).toLocaleString('en-US') : '';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles(currentColors).container, { backgroundColor: currentColors.background }]}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[currentColors.primary, currentColors.background]}
        style={styles(currentColors).headerGradient}
      >
        <Text style={styles(currentColors).title}>الإعدادات</Text>
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

      <ScrollView contentContainerStyle={styles(currentColors).scrollContainer} keyboardShouldPersistTaps="handled">

        {/* Section 1: Billing */}
        <View style={[styles(currentColors).card, Shadows.md]}>
          <View style={styles(currentColors).sectionHeader}>
            <Ionicons name="cash-outline" size={20} color={currentColors.primary} />
            <Text style={styles(currentColors).sectionTitle}>قسم الحسابات</Text>
          </View>
          <Text style={styles(currentColors).label}>سعر الأمبير الواحد</Text>
          <TextInput
            style={[styles(currentColors).input, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
            value={displayPrice}
            onChangeText={handlePriceChange}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={currentColors.textSecondary}
            selectTextOnFocus={true}
            textAlign="center"
          />
        </View>

        {/* Section 2: الهوية - للمشغل للعرض فقط، وصاحب المولدة يستطيع تعديل بياناته */}
        {isOperator ? (
          <View style={[styles(currentColors).card, Shadows.md]}>
            <View style={styles(currentColors).sectionHeader}>
              <Ionicons name="person-outline" size={20} color={currentColors.primary} />
              <Text style={styles(currentColors).sectionTitle}>بيانات الحساب</Text>
            </View>
            <Text style={styles(currentColors).label}>اسم المشغل</Text>
            <View style={[styles(currentColors).readOnlyBox, { backgroundColor: currentColors.inputBg, borderColor: currentColors.border }]}>
              <Text style={[styles(currentColors).readOnlyText, { color: currentColors.text }]}>{ownerName || '---'}</Text>
            </View>

            <Text style={[styles(currentColors).label, { marginTop: 15 }]}>صاحب المولدة</Text>
            <View style={[styles(currentColors).readOnlyBox, { backgroundColor: currentColors.inputBg, borderColor: currentColors.border }]}>
              <Text style={[styles(currentColors).readOnlyText, { color: currentColors.text }]}>{operatorOwnerName || '---'}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles(currentColors).card, Shadows.md]}>
            <View style={styles(currentColors).sectionHeader}>
              <Ionicons name="person-outline" size={20} color={currentColors.primary} />
              <Text style={styles(currentColors).sectionTitle}>بيانات صاحب المولدة</Text>
            </View>
            <Text style={styles(currentColors).label}>الاسم الرباعي</Text>
            <TextInput
              style={[styles(currentColors).input, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="مثال: أحمد محمد علي"
              placeholderTextColor={currentColors.textSecondary}
              textAlign="right"
            />

            <Text style={[styles(currentColors).label, { marginTop: 15 }]}>رقم الهاتف</Text>
            <TextInput
              style={[styles(currentColors).input, { backgroundColor: currentColors.inputBg, color: currentColors.text }]}
              value={ownerPhone}
              onChangeText={(t) => setOwnerPhone(t.replace(/[^0-9]/g, ''))}
              keyboardType="phone-pad"
              maxLength={11}
              placeholder="07xxxxxxxxx"
              placeholderTextColor={currentColors.textSecondary}
              textAlign="right"
            />
          </View>
        )}

        {/* Gmail account: owners only; operators stay linked through their owner account */}
        {!isOperator ? (
          <View style={[styles(currentColors).card, Shadows.md]}>
            <View style={styles(currentColors).sectionHeader}>
              <Ionicons name="cloud-upload-outline" size={20} color={currentColors.primary} />
              <Text style={styles(currentColors).sectionTitle}>حساب Gmail</Text>
            </View>

            {isGoogleUser(accountUser) ? (
              <>
                <Text style={styles(currentColors).label}>الحساب المرتبط</Text>
                <View style={[styles(currentColors).readOnlyBox, { backgroundColor: currentColors.inputBg, borderColor: currentColors.border }]}>
                  <Text style={[styles(currentColors).readOnlyText, { color: currentColors.text }]}>{accountUser.email || '---'}</Text>
                </View>
                <Text style={[styles(currentColors).accountHint, { color: currentColors.textSecondary }]}>
                  تُربط أسماء المشتركين والأسعار والمشغلون بهذا الحساب تلقائياً.
                </Text>
                <TouchableOpacity
                  style={[styles(currentColors).accountButton, { borderColor: currentColors.border, backgroundColor: currentColors.inputBg }]}
                  onPress={handleGoogleSignOut}
                  disabled={accountBusy}
                >
                  <Ionicons name="log-out-outline" size={18} color={currentColors.text} />
                  <Text style={[styles(currentColors).accountButtonText, { color: currentColors.text }]}>تسجيل الخروج</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles(currentColors).accountHint, { color: currentColors.textSecondary }]}>
                  {isGoogleSignInAvailable()
                    ? 'سجّل الدخول بـ Gmail لرفع بياناتك وربط كل المشغلين بحساب واحد.'
                    : 'تسجيل Gmail متاح في نسخة APK المبنية فقط، وليس في Expo Go.'}
                </Text>
                <TouchableOpacity
                  style={[styles(currentColors).accountButton, { backgroundColor: currentColors.primary, opacity: accountBusy || !isGoogleSignInAvailable() ? 0.5 : 1 }]}
                  onPress={handleGoogleSignIn}
                  disabled={accountBusy || !isGoogleSignInAvailable()}
                >
                  <Ionicons name="logo-google" size={18} color="#ffffff" />
                  <Text style={[styles(currentColors).accountButtonText, { color: '#ffffff' }]}>
                    {accountBusy ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول بـ Gmail'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}

        {/* Section 3: Appearance */}
        <View style={[styles(currentColors).card, Shadows.md]}>
          <View style={styles(currentColors).sectionHeader}>
            <Ionicons name="color-palette-outline" size={20} color={currentColors.primary} />
            <Text style={styles(currentColors).sectionTitle}>مظهر التطبيق</Text>
          </View>
          <View style={styles(currentColors).themeRow}>
            <TouchableOpacity
              style={[styles(currentColors).themeOption, theme === 'dark' && styles(currentColors).activeTheme]}
              onPress={() => setTheme('dark')}
            >
              <Text style={[styles(currentColors).themeText, theme === 'dark' && styles(currentColors).activeThemeText]}>الوضع الليلي</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles(currentColors).themeOption, theme === 'light' && styles(currentColors).activeTheme]}
              onPress={() => setTheme('light')}
            >
              <Text style={[styles(currentColors).themeText, theme === 'light' && styles(currentColors).activeThemeText]}>الوضع النهاري</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={styles(currentColors).footerInfo}>
          <Text style={styles(currentColors).footerText}>تطبيق أمبيرك</Text>
          <Text style={styles(currentColors).versionText}>إصدار 2.7.1</Text>
          <View style={styles(currentColors).footerDivider} />
          <Text style={styles(currentColors).copyrightText}>جميع الحقوق محفوظة 2026</Text>
        </View>

        <TouchableOpacity style={[styles(currentColors).button, Shadows.sm]} onPress={handleSave}>
          <Text style={styles(currentColors).buttonText}>حفظ الإعدادات</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
    paddingTop: 18,
    flexGrow: 1,
  },
  headerGradient: {
    paddingTop: 52,
    paddingBottom: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 52,
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
  banner: {
    position: 'absolute',
    top: 210, // Unified position
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
    fontSize: 15,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 15,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.primary,
    textAlign: 'right',
  },
  themeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  themeOption: {
    flex: 1,
    padding: 15,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.inputBg,
  },
  activeTheme: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  themeText: {
    color: colors.textSecondary,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
  activeThemeText: {
    color: colors.primary,
  },
  label: {
    fontSize: 19, // Scaled up
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    minHeight: 65, // Increased slightly
    fontSize: 22, // Scaled up
    borderWidth: 1,
    borderColor: colors.border,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  readOnlyBox: {
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    minHeight: 65,
    borderWidth: 1,
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    textAlign: 'right',
  },
  accountHint: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    textAlign: 'right',
    marginTop: 10,
    marginBottom: 12,
  },
  accountButton: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  accountButtonText: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 21, // Scaled up
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
  footerInfo: {
    marginTop: 40,
    marginBottom: 20,
    alignItems: 'center',
    opacity: 0.8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    width: '100%',
  },
  footerText: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.primary,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  footerDivider: {
    width: 30,
    height: 1,
    backgroundColor: '#ccc',
    marginVertical: 15,
    borderRadius: 1,
  },
  copyrightText: {
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
});
