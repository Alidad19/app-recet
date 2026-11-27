// App configuration
// Change to 'public' for the public version
// Change to 'dev' for the developer version
export const APP_VARIANT = process.env.APP_VARIANT || 'dev';

export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDiUgo3N3Kcj-iGWZ4Nwj4PqmJxBku51b0',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'app-recet.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'app-recet',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'app-recet.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '638737537532',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:638737537532:android:63da0c719bcebd9df33a79',
};

export const ACTIVATION_CONFIG_DOC = { collection: 'appConfig', doc: 'activation' };
export const DEVICES_COLLECTION = 'devices';
export const ACTIVATION_CODES_COLLECTION = 'activation_codes';
export const ACTIVATION_REQUESTS_COLLECTION = 'activation_requests';
export const OPERATOR_REQUESTS_COLLECTION = 'operator_requests';
export const OWNERS_COLLECTION = 'owners';
export const NOTIFICATIONS_COLLECTION = 'admin_notifications';
