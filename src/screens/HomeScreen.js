import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, TextInput, Vibration, Modal, KeyboardAvoidingView, Platform, StatusBar, Keyboard } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { getUsers, getAmperePrice, setAmperePrice as saveAmperePrice, getTheme, getOperatorOwnerName } from '../storage';
import { useRole, isOperator as hasOperatorRole } from '../RoleContext';
import { fetchSharedOwnerData, publishSharedOwnerData } from '../ownerDataSync';
import { getCurrentAuthUser, isGoogleUser, uploadOwnerAccount } from '../account';
import { Colors, Spacing, Shadows, Fonts } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen({ navigation }) {
  const role = useRole();
  const isOperator = hasOperatorRole(role);
  const [allUsers, setAllUsers] = useState([]);
  const [displayedUsers, setDisplayedUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [amperePrice, setAmperePrice] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [showPriceTip, setShowPriceTip] = useState(false);
  const [quickPrice, setQuickPrice] = useState('');
  const [theme, setTheme] = useState('light');
  const [ownerName, setOwnerName] = useState('');
  const [operatorOwnerName, setOperatorOwnerName] = useState('');
  const isFocused = useIsFocused();
  const PAGE_SIZE = 20;
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }

    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [isFocused, isOperator]);

  useEffect(() => {
    (async () => {
      const tipSeen = await AsyncStorage.getItem('@ampere_price_tip_seen');
      if (tipSeen !== 'true') {
        setShowPriceTip(true);
      }
    })();
  }, []);

  const dismissPriceTip = async () => {
    setShowPriceTip(false);
    await AsyncStorage.setItem('@ampere_price_tip_seen', 'true');
  };

  const loadData = async () => {
    setIsLoading(true);
    setPage(1); // Reset page on reload
    const [fetchedUsers, fetchedPrice, fetchedTheme, storedOwnerName, storedOwnerDisplayName, storedOwnerPhone] = await Promise.all([
      getUsers(),
      getAmperePrice(),
      getTheme(),
      AsyncStorage.getItem('@generator_owner_name'),
      getOperatorOwnerName(),
      AsyncStorage.getItem('@generator_owner_phone'),
    ]);

    let usersToShow = fetchedUsers;
    let priceToShow = fetchedPrice;

    if (isOperator) {
      // المشغل يرى سعر الأمبير والمشتركين كما أضافهم صاحب المولدة.
      const shared = await fetchSharedOwnerData();
      if (shared.amperePrice > 0) {
        priceToShow = shared.amperePrice;
        await saveAmperePrice(shared.amperePrice);
      }
      if (Array.isArray(shared.users) && shared.users.length) {
        usersToShow = shared.users;
      }
    } else if (fetchedPrice > 0) {
      // تحديث بيانات المشغلين بالسعر والمشتركين الحاليين لصاحب المولدة.
      publishSharedOwnerData({
        amperePrice: fetchedPrice,
        ownerName: storedOwnerName || '',
        ownerPhone: storedOwnerPhone || '',
        users: fetchedUsers,
      });

      const accountUser = getCurrentAuthUser();
      if (isGoogleUser(accountUser)) {
        uploadOwnerAccount({
          name: storedOwnerName || '',
          phone: storedOwnerPhone || '',
          amperePrice: fetchedPrice,
          theme: fetchedTheme,
          users: fetchedUsers,
        });
      }
    }

    setAllUsers(usersToShow);
    setDisplayedUsers(usersToShow.slice(0, PAGE_SIZE));
    setAmperePrice(priceToShow);
    setTheme(fetchedTheme);
    setOwnerName(storedOwnerName || '');
    setOperatorOwnerName(storedOwnerDisplayName || '');
    setIsLoading(false);
  };

  const handleLoadMore = () => {
    // skip if searching or already loading or no more items
    if (searchQuery || isMoreLoading || displayedUsers.length >= allUsers.length) return;

    setIsMoreLoading(true);
    
    // Simulating small delay for smooth feel
    setTimeout(() => {
      const nextPage = page + 1;
      const start = (nextPage - 1) * PAGE_SIZE;
      const nextBatch = allUsers.slice(0, nextPage * PAGE_SIZE); // Incremental grow
      
      setDisplayedUsers(nextBatch);
      setPage(nextPage);
      setIsMoreLoading(false);
    }, 400); 
  };

  const currentColors = Colors[theme];

  const totalAmperes = allUsers.reduce((sum, user) => sum + (parseFloat(user.amperes) || 0), 0);
  const expectedTotalAmount = totalAmperes * amperePrice;

  const handleQuickSavePrice = async () => {
    if (!quickPrice || isNaN(quickPrice) || parseFloat(quickPrice) <= 0) {
      setModalVisible(false);
      return;
    }
    const newPrice = parseFloat(quickPrice);
    await saveAmperePrice(newPrice);
    setAmperePrice(newPrice);
    if (!isOperator) {
      const ownerPhoneLocal = await AsyncStorage.getItem('@generator_owner_phone');
      await publishSharedOwnerData({
        amperePrice: newPrice,
        ownerName: ownerName || '',
        ownerPhone: ownerPhoneLocal || '',
        users: allUsers,
      });

      const accountUser = getCurrentAuthUser();
      if (isGoogleUser(accountUser)) {
        await uploadOwnerAccount({
          name: ownerName,
          phone: ownerPhoneLocal || '',
          amperePrice: newPrice,
          theme,
          users: allUsers,
        });
      }
    }
    setModalVisible(false);
  };

  const renderHeader = () => (
    <View style={styles(currentColors).headerSection}>
      <LinearGradient
        colors={[currentColors.primary, currentColors.primary]}
        style={[styles(currentColors).heroCard, Shadows.sm]}
      >
        <View style={styles(currentColors).heroTopRow}>
          <View style={styles(currentColors).heroIcon}>
            <Ionicons name="wallet-outline" size={22} color="#ffffff" />
          </View>
          <Text style={styles(currentColors).heroLabel}>الدخل الكلي المتوقع</Text>
        </View>
        <Text style={styles(currentColors).heroValue}>{expectedTotalAmount.toLocaleString('en-US')} <Text style={styles(currentColors).currency}>د.ع</Text></Text>
      </LinearGradient>

      <View style={styles(currentColors).statsRow}>
        <View style={styles(currentColors).miniStat}>
          <View style={styles(currentColors).miniIcon}>
            <Ionicons name="flash-outline" size={17} color={currentColors.primary} />
          </View>
          <Text style={styles(currentColors).miniLabel}>إجمالي الأمبيرات</Text>
          <Text style={styles(currentColors).miniValue}>{totalAmperes}</Text>
        </View>
        <TouchableOpacity
          style={[styles(currentColors).miniStat, styles(currentColors).miniStatBorder]}
          onLongPress={() => {
            Vibration.vibrate(50);
            setQuickPrice(amperePrice ? amperePrice.toString() : '');
            setModalVisible(true);
          }}
          delayLongPress={400}
        >
          <View style={styles(currentColors).miniIcon}>
            <Ionicons name="pricetag-outline" size={17} color={currentColors.primary} />
          </View>
          <Text style={styles(currentColors).miniLabel}>سعر الأمبير</Text>
          <Text style={styles(currentColors).miniValue}>{amperePrice.toLocaleString('en-US')} د.ع</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderItem = ({ item }) => {
    const userTotalDue = item.amperes * amperePrice;
    const userPaid = (item.payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const userRemaining = userTotalDue - userPaid;

    return (
      <TouchableOpacity
        style={[styles(currentColors).userCard, Shadows.sm]}
        onPress={() => navigation.navigate('UserDetails', { user: item, amperePrice })}
        activeOpacity={0.82}
      >
        <View style={styles(currentColors).userMainInfo}>
          <View style={styles(currentColors).userTextColumn}>
            <Text style={styles(currentColors).userName}>
              {item.name}{item.nickname ? ` (${item.nickname})` : ''}
            </Text>
            <View style={styles(currentColors).ampereBadge}>
              <Ionicons name="flash" size={13} color={currentColors.primary} />
              <Text style={styles(currentColors).userAmperes}>{item.amperes} أمبير</Text>
            </View>
          </View>
          <View style={styles(currentColors).userPriceInfo}>
            <Text style={styles(currentColors).userRemainingLabel}>المتبقي</Text>
            <Text style={[
              styles(currentColors).userRemainingValue,
              { color: userRemaining <= 0 ? currentColors.success : currentColors.error }
            ]}>
              {userRemaining.toLocaleString('en-US')} د.ع
            </Text>
          </View>
        </View>
        <Ionicons
          name="chevron-back"
          size={18}
          color={currentColors.textSecondary}
          style={styles(currentColors).userChevron}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles(currentColors).container, { backgroundColor: currentColors.background }]}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[currentColors.primary, currentColors.background]}
        style={styles(currentColors).topHeader}
      >
        <View style={styles(currentColors).topBar}>
          <Text style={styles(currentColors).title}>أمبيرك</Text>
          <Text style={styles(currentColors).identityText}>
            {isOperator
              ? `المشغل: ${ownerName || '---'}   |   صاحب المولدة: ${operatorOwnerName || '---'}`
              : `صاحب المولدة: ${ownerName || '---'}`}
          </Text>
        </View>

        <View style={styles(currentColors).searchWrapper}>
          <View style={styles(currentColors).searchIcon}>
            <Ionicons name="search" size={20} color={currentColors.textSecondary} />
          </View>
          <TextInput
            style={styles(currentColors).searchInput}
            placeholder="ابحث عن مشترك..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)'}
            textAlign="right"
            includeFontPadding={false}
            textAlignVertical="center"
          />
        </View>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator size="large" color={currentColors.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={searchQuery 
            ? allUsers.filter(u => u.name.includes(searchQuery) || (u.nickname && u.nickname.includes(searchQuery))) 
            : displayedUsers
          }
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles(currentColors).listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            isMoreLoading ? (
              <ActivityIndicator size="small" color={currentColors.primary} style={{ marginVertical: 20 }} />
            ) : <View style={{ height: 40 }} />
          )}
          ListEmptyComponent={
            <View style={styles(currentColors).emptyContainer}>
              <Text style={styles(currentColors).emptyText}>لا يوجد مشتركين حالياً.</Text>
            </View>
          }
        />
      )}

      {showPriceTip && (
        <TouchableOpacity
          activeOpacity={1}
          style={styles(currentColors).priceTipOverlay}
          onPress={() => { }}
        >
          <View style={styles(currentColors).priceTipCard}>
            <View style={styles(currentColors).priceTipHandle} />
            <View style={styles(currentColors).priceTipHeader}>
              <View style={styles(currentColors).priceTipIcon}>
                <Ionicons name="hand-left-outline" size={24} color={currentColors.primary} />
              </View>
              <View style={styles(currentColors).priceTipTitleBox}>
                <Text style={styles(currentColors).priceTipTitle}>تغيير سعر الأمبير</Text>
                <Text style={styles(currentColors).priceTipSubtitle}>ميزة سريعة في شاشة الرئيسية</Text>
              </View>
            </View>
            <Text style={styles(currentColors).priceTipText}>
              انقر مطولاً على سعر الأمبير لتغيير السعر
            </Text>
            <TouchableOpacity
              style={styles(currentColors).priceTipButton}
              onPress={dismissPriceTip}
            >
              <Text style={styles(currentColors).priceTipButtonText}>فهمت</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Bottom Bar: Settings (Right), Add (Center), Calculator (Left) */}
      {!isKeyboardVisible && (
        <View style={[styles(currentColors).bottomBar, Shadows.lg]}>
        <TouchableOpacity style={styles(currentColors).bottomBarBtn} onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={28} color={currentColors.primary} />
          <Text style={[styles(currentColors).bottomBarLabel, { color: currentColors.primary }]}>الاعدادات</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles(currentColors).bottomAddBtn} onPress={() => navigation.navigate('AddUser')}>
          <Ionicons name="add" size={32} color="#ffffff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles(currentColors).bottomBarBtn} onPress={() => navigation.navigate('Cards')}>
          <Ionicons name="card-outline" size={28} color={currentColors.primary} />
          <Text style={[styles(currentColors).bottomBarLabel, { color: currentColors.primary }]}>البطاقات</Text>
        </TouchableOpacity>
        </View>
      )}

      <Modal visible={isModalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles(currentColors).modalOverlay}>
          <TouchableOpacity activeOpacity={1} style={styles(currentColors).modalBackdrop} onPress={() => setModalVisible(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles(currentColors).modalSheet}>
            <LinearGradient
              colors={[currentColors.primary, currentColors.primary]}
              style={styles(currentColors).modalHero}
            >
              <View style={styles(currentColors).modalHeroIcon}>
                <Ionicons name="pricetag" size={30} color="#ffffff" />
              </View>
              <Text style={styles(currentColors).modalHeroTitle}>تحديث سعر الأمبير</Text>
              <Text style={styles(currentColors).modalHeroSubtitle}>غيّر السعر وستُحدَّث الحسابات تلقائياً</Text>
            </LinearGradient>

            <View style={styles(currentColors).modalBody}>
              <View style={[styles(currentColors).modalCurrentRow, { backgroundColor: currentColors.inputBg, borderColor: currentColors.border }]}>
                <View style={[styles(currentColors).modalCurrentIcon, { backgroundColor: currentColors.primaryLight }]}>
                  <Ionicons name="flash" size={20} color={currentColors.primary} />
                </View>
                <View style={styles(currentColors).modalCurrentTexts}>
                  <Text style={[styles(currentColors).modalCurrentLabel, { color: currentColors.textSecondary }]}>السعر الحالي</Text>
                  <Text style={[styles(currentColors).modalCurrentValue, { color: currentColors.text }]}>
                    {amperePrice.toLocaleString('en-US')} د.ع
                  </Text>
                </View>
              </View>

              <Text style={[styles(currentColors).modalFieldLabel, { color: currentColors.text }]}>السعر الجديد</Text>
              <View style={[styles(currentColors).modalInputWrap, { backgroundColor: currentColors.inputBg, borderColor: currentColors.border }]}>
                <TextInput
                  style={[styles(currentColors).modalInput, { color: currentColors.text }]}
                  value={quickPrice ? Number(quickPrice).toLocaleString('en-US') : ''}
                  onChangeText={(text) => setQuickPrice(text.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  selectTextOnFocus
                  textAlign="right"
                  placeholder="0"
                  placeholderTextColor={currentColors.textSecondary}
                />
                <Text style={[styles(currentColors).modalCurrency, { color: currentColors.primary }]}>د.ع</Text>
              </View>
              <Text style={[styles(currentColors).modalHint, { color: currentColors.textSecondary }]}>
                أدخل رقماً صحيحاً فقط
              </Text>

              <View style={styles(currentColors).modalActions}>
                <TouchableOpacity
                  style={[styles(currentColors).modalCancel, { backgroundColor: currentColors.inputBg, borderColor: currentColors.border }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Ionicons name="close-outline" size={18} color={currentColors.text} />
                  <Text style={[styles(currentColors).modalCancelText, { color: currentColors.text }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles(currentColors).modalSave, { backgroundColor: currentColors.primary }]}
                  onPress={handleQuickSavePrice}
                >
                  <Ionicons name="checkmark" size={18} color="#ffffff" />
                  <Text style={styles(currentColors).modalSaveText}>حفظ</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    paddingTop: 46,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  topBar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    width: '100%',
    marginBottom: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: '#ffffff',
    textAlign: 'center',
  },
  identityText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
    height: 72,
    backgroundColor: colors.card,
    borderRadius: 24,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bottomBarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  bottomBarBtnPlaceholder: {
    flex: 1,
  },
  bottomBarLabel: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
  bottomAddBtn: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -38,
    ...Shadows.md,
  },
  searchWrapper: {
    marginHorizontal: 16,
    marginTop: 14,
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    right: 16,
    top: 15,
    zIndex: 2,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 48,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    minHeight: 52,
    fontSize: 17,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  headerSection: {
    marginBottom: 18,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 22,
  },
  heroTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '700',
  },
  heroValue: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    fontFamily: Fonts.regular,
    textAlign: 'left',
    marginTop: 12,
  },
  currency: {
    fontSize: 16,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row-reverse',
    backgroundColor: colors.card,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniStat: {
    flex: 1,
    alignItems: 'center',
    minHeight: 62,
  },
  miniStatBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  miniIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  miniLabel: {
    color: colors.textSecondary,
    fontSize: 14, // Scaled for all app
    marginBottom: 4,
  },
  miniValue: {
    color: colors.text,
    fontSize: 18, // Scaled for all app
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 110,
  },
  userCard: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  userMainInfo: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 18,
  },
  userTextColumn: {
    flex: 1,
  },
  userName: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  ampereBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 7,
  },
  userAmperes: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'right',
    fontWeight: '700',
  },
  userPriceInfo: {
    alignItems: 'flex-start',
    marginLeft: 10,
  },
  userRemainingLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  userRemainingValue: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  userChevron: {
    position: 'absolute',
    right: 6,
    top: 18,
  },
  priceTipOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 20,
    zIndex: 100,
    elevation: 12,
  },
  priceTipCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 18,
  },
  priceTipHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  priceTipHeader: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 14,
  },
  priceTipIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceTipTitleBox: {
    flex: 1,
    marginRight: 12,
  },
  priceTipTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    fontFamily: Fonts.regular,
    textAlign: 'right',
  },
  priceTipSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },
  priceTipText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  priceTipButton: {
    width: '100%',
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  priceTipButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  emptyContainer: {
    padding: 50,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.lg,
  },
  modalHero: {
    paddingTop: 24,
    paddingBottom: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  modalHeroIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  modalHeroTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: Fonts.regular,
    color: '#ffffff',
    textAlign: 'center',
  },
  modalHeroSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.regular,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
  },
  modalBody: {
    padding: 20,
    gap: 14,
  },
  modalCurrentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  modalCurrentIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCurrentTexts: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  modalCurrentLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.regular,
  },
  modalCurrentValue: {
    fontSize: 17,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  modalFieldLabel: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: Fonts.regular,
    textAlign: 'right',
  },
  modalInputWrap: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 16,
  },
  modalInput: {
    flex: 1,
    height: '100%',
    fontSize: 26,
    fontWeight: '900',
    fontFamily: Fonts.regular,
    backgroundColor: 'transparent',
  },
  modalCurrency: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: Fonts.regular,
    marginLeft: 8,
  },
  modalHint: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    textAlign: 'right',
    marginTop: -6,
  },
  modalActions: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  modalCancel: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  modalSave: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalSaveText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  calcFullScreen: {
    flex: 1,
    backgroundColor: '#0B0F2A',
    paddingTop: 16,
  },
  calcCloseFloating: {
    position: 'absolute',
    left: 16,
    top: '20%',
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    zIndex: 10,
  },
  calcDisplay: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 32,
    justifyContent: 'flex-end',
  },
  calcExpressionText: {
    color: '#F2F3FF',
    fontSize: 42,
    lineHeight: 48,
    textAlign: 'left',
    letterSpacing: 0.2,
  },
  calcResultRow: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  calcResultText: {
    color: '#C9A3FF',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '700',
  },
  calcErrorText: {
    color: '#FCA5A5',
  },
  calcPad: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 12,
  },
  calcKeyRow: {
    flexDirection: 'row',
    gap: 12,
  },
  calcKey: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222552',
  },
  calcKeyWide: {
    flex: 2,
    aspectRatio: 2,
    borderRadius: 999,
  },
  calcKeyText: {
    color: '#EDEEFF',
    fontSize: 22,
    fontWeight: '700',
  },
  calcKeyOp: {
    backgroundColor: '#2B2E67',
  },
  calcKeyOpText: {
    color: '#D6D8FF',
    fontSize: 20,
    fontWeight: '800',
  },
  calcKeyAction: {
    backgroundColor: '#6A82FF',
  },
  calcKeyActionText: {
    color: '#0B0F2A',
    fontSize: 18,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  calcKeyEqual: {
    backgroundColor: '#F5A3D3',
  },
  calcKeyEqualText: {
    color: '#0B0F2A',
    fontSize: 22,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  calcHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  calcHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  calcCloseBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  calcTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    textAlign: 'center',
    color: colors.text,
  },
  calcDisplayArea: {
    backgroundColor: colors.inputBg,
    borderRadius: 25,
    padding: 25,
    marginVertical: 20,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  calcDisplayText: {
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.text,
  },
  calcGrid: {
    gap: 12,
  },
  calcRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 12,
  },
  calcBtn: {
    width: '21.5%',
    aspectRatio: 1,
    backgroundColor: colors.card,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calcBtnText: {
    fontSize: 26,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: colors.text,
  },
  opBtn: {
    backgroundColor: 'rgba(49, 46, 129, 0.1)',
    borderColor: 'rgba(49, 46, 129, 0.2)',
  },
  opBtnText: {
    fontSize: 26,
    fontWeight: 'bold',
    fontFamily: Fonts.regular,
    color: '#1d4ed8',
  }
});
