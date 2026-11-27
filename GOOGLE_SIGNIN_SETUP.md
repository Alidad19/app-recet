# تفعيل تسجيل الدخول بـ Gmail

أُضيف زر «تسجيل الدخول بـ Gmail» في إعدادات صاحب المولدة فقط. عند الدخول تُربط البيانات التالية بحساب Google واحد:

- اسم صاحب المولدة ورقمه.
- سعر الأمبير.
- قائمة المشتركين وأسماؤهم.
- المشغلون المرتبطون بصاحب المولدة.

المشغلون أنفسهم لا يحتاجون حساب Gmail؛ يبقون مرتبطين بحساب صاحب المولدة عبر كود التفعيل.

## المطلوب في Firebase Console

1. افتح **Authentication → Sign-in method** وفعّل مزوّد **Google**.
2. من **Web SDK configuration** انسخ **Web client ID**.
3. في **Project settings → Your apps → Android app** أضف **SHA-1** الخاص بشهادة توقيع EAS.
4. تأكد من أن النطاقين التاليين مضافان في **Authorized domains**:
   - `app-recet.firebaseapp.com`
   - `app-recet-admin.web.app`

## المتغير المطلوب في EAS

أضف متغير بيئة من نوع **Plain text** في مشروع EAS:

```text
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

ثم أعد بناء APK؛ القيمة تُضمَّن داخل البناء أثناء compile.

للتجربة محلياً أضف القيمة نفسها في `.env`:

```text
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

## قواعد Firestore

يجب نشر `firestore.rules` بعد إضافة مجموعة `owners`. بدون نشرها سيفشل رفع بيانات الحساب.

```bash
firebase deploy --only firestore:rules --project app-recet
```
