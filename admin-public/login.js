import { auth } from './firebase-config.js';
import { getAdminAccess, ADMIN_EMAIL } from './admin-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');

function showError(message) {
    if (loginError) loginError.textContent = message || '';
}

function redirectToDashboard() {
    window.location.replace('dashboard.html');
}

function setLoading(loading) {
    if (!loginBtn) return;
    loginBtn.disabled = loading;
    loginBtn.textContent = loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول';
}

async function allowDashboard(user) {
    const access = await getAdminAccess(user?.email);
    if (access.allowed) return true;

    showError('هذا البريد الإلكتروني غير مصرح له بالدخول.');
    await signOut(auth);
    return false;
}

// التعامل مع جلسة مسجّلة مسبقاً (مثلاً بعد تحديث الصفحة)
// هذا الملف محمّل فقط في صفحة الدخول، لذا نوجه دائماً عند نجاح التحقق
onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    if (await allowDashboard(user)) {
        redirectToDashboard();
    }
});

if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        showError('');

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError('الرجاء إدخال البريد الإلكتروني وكلمة المرور.');
            return;
        }

        // التحقق المسبق من البريد المسموح قبل الاتصال بـ Firebase
        if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            showError('هذا البريد الإلكتروني غير مصرح له بالدخول.');
            return;
        }

        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // توجيه مباشر لضمان الدخول حتى لو تأخر onAuthStateChanged
            redirectToDashboard();
        } catch (error) {
            const friendlyMessages = {
                'auth/user-not-found': 'الحساب غير موجود. تواصل مع المطور لإنشاء حساب الأدمن.',
                'auth/wrong-password': ' كلمة المرور غير صحيحة.',
                'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
                'auth/too-many-requests': 'تم قفل الحساب مؤقتاً لكثرة المحاولات. حاول لاحقاً.',
                'auth/network-request-failed': 'خطأ في الاتصال. تحقق من الإنترنت وحاول مرة أخرى.',
                'auth/invalid-email': 'تنسيق البريد الإلكتروني غير صحيح.',
                'auth/user-disabled': 'هذا الحساب معطل.',
                'auth/operation-not-allowed': 'تسجيل الدخول بالبريد والكلمة غير مفعّل في Firebase.',
            };
            showError(friendlyMessages[error.code] || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
            if (!['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(error.code)) {
                console.warn('Firebase Auth Error:', error.code, error.message);
            }
        } finally {
            setLoading(false);
        }
    });
}
