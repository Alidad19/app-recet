import { Platform } from 'react-native';
import * as Application from 'expo-application';

export async function getStableDeviceId() {
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
