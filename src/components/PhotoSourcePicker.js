import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows, Fonts } from '../theme';

// بديل عن Alert.alert داخل النوافذ: اختيار الكاميرا أو الاستوديو دون تعارض مع الكيبورد/النافذة.
export default function PhotoSourcePicker({
  visible,
  title = 'إضافة صورة',
  theme = 'light',
  onCamera,
  onGallery,
  onCancel,
}) {
  if (!visible) return null;

  const colors = Colors[theme] || Colors.light;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFillObject} onPress={onCancel} />

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, Shadows.lg]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="images-outline" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>اختر طريقة إضافة الصورة</Text>

        <TouchableOpacity
          style={[styles.option, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
          onPress={onCamera}
        >
          <Ionicons name="camera-outline" size={20} color={colors.primary} />
          <Text style={[styles.optionText, { color: colors.primary }]}>الكاميرا</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
          onPress={onGallery}
        >
          <Ionicons name="image-outline" size={20} color={colors.text} />
          <Text style={[styles.optionText, { color: colors.text }]}>الاستوديو</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancel} onPress={onCancel}>
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>إلغاء</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 100,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: Fonts.regular,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    textAlign: 'center',
    marginBottom: 4,
  },
  option: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: Fonts.regular,
  },
  cancel: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 2,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.regular,
  },
});
