import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, Timestamp, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSyDiUgo3N3Kcj-iGWZ4Nwj4PqmJxBku51b0",
  authDomain: "app-recet.firebaseapp.com",
  projectId: "app-recet",
  storageBucket: "app-recet.firebasestorage.app",
  messagingSenderId: "638737537532",
  appId: "1:638737537532:android:63da0c719bcebd9df33a79"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const adminNav = document.getElementById('admin-nav');
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const codesSection = document.getElementById('codes-section');
const loginForm = document.getElementById('login-form');
const usersList = document.getElementById('users-list');
const codesList = document.getElementById('codes-list');
const usersTable = document.getElementById('users-table');
const loginError = document.getElementById('login-error');

// Modal Elements
const editUserModal = document.getElementById('edit-user-modal');
const editUserForm = document.getElementById('edit-user-form');
const editUserId = document.getElementById('edit-user-id');
const editOwnerName = document.getElementById('edit-owner-name');
const editActivationCode = document.getElementById('edit-activation-code');
const editActivated = document.getElementById('edit-activated');
const editError = document.getElementById('edit-error');

const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const deleteUserName = document.getElementById('delete-user-name');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

const toggleActivationModal = document.getElementById('toggle-activation-modal');
const toggleActivationTitle = document.getElementById('toggle-activation-title');
const toggleActivationActionText = document.getElementById('toggle-activation-action-text');
const toggleActivationUserName = document.getElementById('toggle-activation-user-name');
const confirmToggleActivationBtn = document.getElementById('confirm-toggle-activation-btn');

const generalMessageModal = document.getElementById('general-message-modal');
const generalMessageTitle = document.getElementById('general-message-title');
const generalMessageText = document.getElementById('general-message-text');

// Close buttons for modals
document.querySelectorAll('.close-button').forEach(button => {
    button.addEventListener('click', (e) => {
        const modalId = e.target.dataset.modal;
        document.getElementById(modalId).style.display = 'none';
    });
});

// Close buttons for general message modal
document.querySelectorAll('#general-message-modal .btn-primary').forEach(button => {
    button.addEventListener('click', () => {
        generalMessageModal.style.display = 'none';
    });
});

// Close modals when clicking outside
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});

// مراقبة حالة المستخدم
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (adminNav) adminNav.style.display = 'flex';
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        fetchUsers();
        fetchCodes();
    } else {
        if (adminNav) adminNav.style.display = 'none';
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
        codesSection.style.display = 'none';
    }
});

// التنقل بين الأقسام
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        dashboardSection.style.display = target === 'dashboard-section' ? 'block' : 'none';
        codesSection.style.display = target === 'codes-section' ? 'block' : 'none';
    });
});

// تسجيل الخروج
document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth);
});

// تسجيل الدخول
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    loginError.textContent = ''; // Clear previous errors

    signInWithEmailAndPassword(auth, email, password)
        .catch(error => {
            // معالجة أكواد خطأ Firebase الشائعة
            let friendlyMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';

            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                friendlyMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
            } else if (error.code === 'auth/too-many-requests') {
                friendlyMessage = 'تم قفل الحساب مؤقتاً لكثرة المحاولات. حاول لاحقاً.';
            } else if (error.code === 'auth/network-request-failed') {
                friendlyMessage = 'خطأ في الاتصال. تحقق من الإنترنت وحاول مرة أخرى.';
            } else if (error.code === 'auth/invalid-email') {
                friendlyMessage = 'تنسيق البريد الإلكتروني غير صحيح.';
            } else if (error.code === 'auth/user-disabled') {
                friendlyMessage = 'هذا الحساب معطل.';
            }

            loginError.textContent = friendlyMessage;
            console.warn('Firebase Auth Error:', error.code, error.message);
        });
});

// جلب بيانات المستخدمين من Firestore
async function fetchUsers() {
    usersList.innerHTML = '<tr><td colspan="5" style="text-align:center">جارٍ التحميل...</td></tr>';
    
    try {
        const q = query(collection(db, "devices"), orderBy("lastSeenAt", "desc")); // Assuming "devices" is your collection
        const querySnapshot = await getDocs(q);
        
        usersList.innerHTML = ''; // مسح رسالة التحميل
        
        if (querySnapshot.empty) {
            usersList.innerHTML = '<tr><td colspan="5" style="text-align:center">لا يوجد مستخدمين حالياً.</td></tr>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const row = document.createElement('tr');
            row.dataset.userId = doc.id; // Store user ID on the row
            
            // تحويل الـ Timestamp الخاص بـ Firebase إلى نص قابل للقراءة
            const lastSeen = data.lastSeenAt ? data.lastSeenAt.toDate().toLocaleString('ar-IQ') : 'غير معروف';
            
            row.innerHTML = `
                <td>${data.ownerName || 'غير محدد'}</td>
                <td>${data.activationCode || '---'}</td>
                <td><code>${doc.id}</code></td>
                <td>${data.activated ? '✅ مفعل' : '❌ غير مفعل'}</td>
                <td>${lastSeen}</td>
                <td>
                    <button title="تعديل" class="action-btn edit" data-id="${doc.id}" data-owner="${data.ownerName || ''}" data-code="${data.activationCode || ''}" data-activated="${data.activated || false}" data-token="${data.expoPushToken || ''}">تعديل</button>
                    <button title="${data.activated ? 'توقيف' : 'تفعيل'}" class="action-btn toggle" data-id="${doc.id}" data-name="${data.ownerName || doc.id}" data-activated="${data.activated || false}">${data.activated ? 'توقيف' : 'تفعيل'}</button>
                    <button title="حذف" class="action-btn delete" data-id="${doc.id}" data-name="${data.ownerName || doc.id}">حذف</button>
                </td>
            `;
            usersList.appendChild(row);
        });

        // Attach event listeners to new buttons
        attachActionButtonsListeners();
    } catch (error) {
        console.error("Error fetching users:", error);
        usersList.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center">فشل في جلب البيانات. تأكد من قواعد الحماية (Rules).</td></tr>';
    }
}

// جلب أكواد التفعيل
async function fetchCodes() {
    codesList.innerHTML = '<tr><td colspan="5" style="text-align:center">جارٍ التحميل...</td></tr>';
    try {
        const q = query(collection(db, "activation_codes"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        codesList.innerHTML = '';

        if (querySnapshot.empty) {
            codesList.innerHTML = '<tr><td colspan="5" style="text-align:center">لا توجد أكواد حالياً.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const row = document.createElement('tr');
            const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString('ar-IQ') : '---';
            
            row.innerHTML = `
                <td style="font-weight:bold; color:#6A82FF; letter-spacing:1px;">${docSnap.id}</td>
                <td>${data.isUsed ? '<span style="color:red">مستخدم</span>' : '<span style="color:green">جاهز</span>'}</td>
                <td>${data.ownerName || '---'}</td>
                <td>${date}</td>
                <td>
                    <button class="action-btn delete-code" data-id="${docSnap.id}">حذف</button>
                </td>
            `;
            codesList.appendChild(row);
        });

        // إضافة حدث الحذف للأكواد
        codesList.querySelectorAll('.delete-code').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm(`هل أنت متأكد من حذف الكود ${btn.dataset.id}؟`)) {
                    await deleteDoc(doc(db, "activation_codes", btn.dataset.id));
                    fetchCodes();
                }
            });
        });
    } catch (error) {
        console.error(error);
    }
}

// توليد كود عشوائي
function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// زر توليد كود جديد
document.getElementById('generate-code-btn').addEventListener('click', async () => {
    const newCode = generateRandomCode();
    try {
        await setDoc(doc(db, "activation_codes", newCode), {
            isUsed: false,
            createdAt: serverTimestamp(),
            ownerName: ""
        });
        showGeneralMessage('تم التوليد', `تم إنشاء كود جديد بنجاح: ${newCode}`);
        fetchCodes();
    } catch (error) {
        alert('فشل توليد الكود');
    }
});

function attachActionButtonsListeners() {
    usersList.querySelectorAll('.action-btn.edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const owner = e.target.dataset.owner;
            const code = e.target.dataset.code;
            const activated = e.target.dataset.activated === 'true';
            openEditUserModal(id, owner, code, activated);
        });
    });

    usersList.querySelectorAll('.action-btn.delete').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const name = e.target.dataset.name;
            openDeleteUserModal(id, name);
        });
    });

    usersList.querySelectorAll('.action-btn.toggle').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const name = e.target.dataset.name;
            const activated = e.target.dataset.activated === 'true';
            openToggleActivationModal(id, name, activated);
        });
    });
}

// --- Edit User Functions ---
function openEditUserModal(id, owner, code, activated) {
    editUserId.value = id;
    editOwnerName.value = owner;
    editActivationCode.value = code;
    editActivated.checked = activated;
    editError.textContent = '';
    editUserModal.style.display = 'flex';
}

editUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editUserId.value;
    const newOwnerName = editOwnerName.value.trim();
    const newActivationCode = editActivationCode.value.trim();
    const newActivatedStatus = editActivated.checked;
    editError.textContent = '';

    if (!newOwnerName || !newActivationCode) {
        editError.textContent = 'الرجاء تعبئة جميع الحقول المطلوبة.';
        return;
    }

    try {
        const userRef = doc(db, "devices", id);
        await updateDoc(userRef, {
            ownerName: newOwnerName,
            activationCode: newActivationCode,
            activated: newActivatedStatus,
            lastSeenAt: Timestamp.now() // Update last seen to reflect recent activity
        });
        editUserModal.style.display = 'none';
        fetchUsers(); // Refresh the list
        showGeneralMessage('نجاح', 'تم تحديث بيانات المستخدم بنجاح.');
    } catch (error) {
        console.error("Error updating user:", error);
        editError.textContent = 'فشل تحديث المستخدم: ' + error.message;
    }
});

// --- Delete User Functions ---
let userIdToDelete = null;
function openDeleteUserModal(id, name) {
    userIdToDelete = id;
    deleteUserName.textContent = name;
    deleteConfirmModal.style.display = 'flex';
}

confirmDeleteBtn.addEventListener('click', async () => {
    if (userIdToDelete) {
        try {
            await deleteDoc(doc(db, "devices", userIdToDelete));
            deleteConfirmModal.style.display = 'none';
            fetchUsers(); // Refresh the list
            showGeneralMessage('نجاح', 'تم حذف المستخدم بنجاح.');
        } catch (error) {
            console.error("Error deleting user:", error);
            showGeneralMessage('خطأ', 'فشل حذف المستخدم: ' + error.message);
        } finally {
            userIdToDelete = null;
        }
    }
});

// --- Toggle Activation Functions ---
let userIdToToggle = null;
let currentActivationStatus = false;
function openToggleActivationModal(id, name, activated) {
    userIdToToggle = id;
    currentActivationStatus = activated;
    toggleActivationUserName.textContent = name;
    toggleActivationTitle.textContent = activated ? 'توقيف المستخدم' : 'تفعيل المستخدم';
    toggleActivationActionText.textContent = activated ? 'توقيف' : 'تفعيل';
    toggleActivationModal.style.display = 'flex';
}

confirmToggleActivationBtn.addEventListener('click', async () => {
    if (userIdToToggle) {
        try {
            const userRef = doc(db, "devices", userIdToToggle);
            await updateDoc(userRef, {
                activated: !currentActivationStatus,
                lastSeenAt: Timestamp.now() // Update last seen to reflect recent activity
            });
            toggleActivationModal.style.display = 'none';
            fetchUsers(); // Refresh the list
            showGeneralMessage('نجاح', `تم ${!currentActivationStatus ? 'تفعيل' : 'توقيف'} المستخدم بنجاح.`);
        } catch (error) {
            console.error("Error toggling activation:", error);
            showGeneralMessage('خطأ', 'فشل تغيير حالة التفعيل: ' + error.message);
        } finally {
            userIdToToggle = null;
        }
    }
});

// --- General Message Modal Function ---
function showGeneralMessage(title, message) {
    generalMessageTitle.textContent = title;
    generalMessageText.textContent = message;
    generalMessageModal.style.display = 'flex';
}