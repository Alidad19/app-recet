import { auth } from './firebase-config.js';
import { getAdminAccess } from './admin-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function showError(message) {
    if (loginError) loginError.textContent = message;
}

async function allowDashboard(user) {
    const access = await getAdminAccess(user?.email);
    if (access.allowed) return true;

    // توحيد رسالة الخطأ
    showError('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    await signOut(auth);
    return false;
}

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    // تأكد من أننا لا نحاول إعادة التوجيه إذا كنا بالفعل في صفحة الدخول (تجنب الحلقات)
    const isLoginPage = window.location.pathname.includes('login.html');
    if (await allowDashboard(user)) {
        if (isLoginPage) window.location.href = 'dashboard.html';
    } else if (!isLoginPage) {
        redirectToLogin();
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

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // سيتم التعامل مع التوجيه في onAuthStateChanged
        } catch (error) {
            // معالجة أكواد خطأ Firebase الشائعة - منع ظهور 400 في الكونسول
            const friendlyMessages = {
                'auth/user-not-found': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
                'auth/wrong-password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
                'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
                'auth/too-many-requests': 'تم قفل الحساب مؤقتاً لكثرة المحاولات. حاول لاحقاً.',
                'auth/network-request-failed': 'خطأ في الاتصال. تحقق من الإنترنت وحاول مرة أخرى.',
                'auth/invalid-email': 'تنسيق البريد الإلكتروني غير صحيح.',
                'auth/user-disabled': 'هذا الحساب معطل.',
            };
            const message = friendlyMessages[error.code] || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
            showError(message);
            // لا نطبع الخطأ في الكونسول لأنه متوقع عند إدخال بيانات خاطئة
            if (!['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(error.code)) {
                console.warn('Firebase Auth Error:', error.code, error.message);
            }
        }
    });
}
