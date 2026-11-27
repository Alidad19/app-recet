import { db } from './firebase-config.js';

// الإيميل الوحيد المسموح له بالدخول كأدمن
export const ADMIN_EMAIL = 'fefe.411911@gmail.com';

export async function getAdminAccess(email) {
  const current = String(email || '').trim().toLowerCase();
  const allowedEmail = ADMIN_EMAIL.toLowerCase();

  if (!current) {
    return { configured: false, allowed: false };
  }

  // السماح فقط للإيميل المحدد
  const isAllowed = current === allowedEmail;

  return { configured: true, allowed: isAllowed };
}
