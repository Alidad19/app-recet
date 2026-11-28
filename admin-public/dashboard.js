import { auth, db, storage } from './firebase-config.js';
import { getAdminAccess } from './admin-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { addDoc, collection, getDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, setDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const adminNav = document.getElementById('admin-nav');
const dashboardSection = document.getElementById('dashboard-section');
const codesSection = document.getElementById('codes-section');
const requestsSection = document.getElementById('requests-section');
const requestsList = document.getElementById('requests-list');
const pendingRequestsCount = document.getElementById('pending-requests-count');
const notificationsSection = document.getElementById('notifications-section');
const notificationsList = document.getElementById('notifications-list');
const activateRequestId = document.getElementById('activate-request-id');
const activateRequestName = document.getElementById('activate-request-name');
const activateRequestDuration = document.getElementById('activate-request-duration');
const confirmActivateRequestBtn = document.getElementById('confirm-activate-request-btn');
const loginSection = null; // لا يوجد في dashboard.html
const usersList = document.getElementById('users-list');
const codesList = document.getElementById('codes-list');
const loginError = document.getElementById('login-error');
const editUserModal = document.getElementById('edit-user-modal');
const editUserForm = document.getElementById('edit-user-form');
const editUserId = document.getElementById('edit-user-id');
const editOwnerName = document.getElementById('edit-owner-name');
const editActivationCode = document.getElementById('edit-activation-code');
const editRemainingDays = document.getElementById('edit-remaining-days');
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
const logoutBtn = document.getElementById('logout-btn');
const generateCodeBtn = document.getElementById('generate-code-btn');
const codeDurationSelect = document.getElementById('code-duration-select');
const confirmCodeDurationBtn = document.getElementById('confirm-code-duration-btn');
let pendingCodeDurationAction = null;
const totalUsersCount = document.getElementById('total-users-count');
const activeUsersCount = document.getElementById('active-users-count');
const inactiveUsersCount = document.getElementById('inactive-users-count');
const totalCodesCount = document.getElementById('total-codes-count');
const availableCodesCount = document.getElementById('available-codes-count');
const soldCodesCount = document.getElementById('sold-codes-count');
const totalRevenueCount = document.getElementById('total-revenue-count');

// رفع تحديث التطبيق إلى الموقع العام
const updatesSection = document.getElementById('updates-section');
const updatesList = document.getElementById('updates-list');
const currentVersionName = document.getElementById('current-version-name');
const currentVersionNotes = document.getElementById('current-version-notes');
const currentVersionMeta = document.getElementById('current-version-meta');
const uploadUpdateForm = document.getElementById('upload-update-form');
const updateApkFile = document.getElementById('update-apk-file');
const apkDropzone = document.getElementById('apk-dropzone');
const apkFileName = document.getElementById('apk-file-name');
const apkFileMeta = document.getElementById('apk-file-meta');
const updateVersionName = document.getElementById('update-version-name');
const updateVersionCode = document.getElementById('update-version-code');
const updateNotes = document.getElementById('update-notes');
const githubTokenInput = document.getElementById('github-token-input');
const uploadUpdateBtn = document.getElementById('upload-update-btn');
const uploadProgress = document.getElementById('upload-progress');
const uploadProgressFill = document.getElementById('upload-progress-fill');
const uploadProgressText = document.getElementById('upload-progress-text');
const APK_STORAGE_PATH = 'app_updates/app-release.apk';
const APP_DOWNLOAD_PAGE = 'https://alidad19.github.io/app-recet/app-download.html';
const GITHUB_REPO_URL = 'https://github.com/Alidad19/app-recet';
let authStateKnown = false;

if (generateCodeBtn) {
    generateCodeBtn.disabled = true;
}

const loginForm = document.getElementById('login-form');
const emailField = document.getElementById('email');
const passwordField = document.getElementById('password');

const PRICE_BY_MONTHS = {
    1: 10000,
    2: 20000,
    3: 25000,
    6: 50000,
};

const DAYS_BY_MONTHS = {
    1: 30,
    2: 60,
    3: 90,
    6: 180,
};

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US').format(value) + ' د.ع';
}

function getDurationLabel(months) {
    const days = DAYS_BY_MONTHS[months] || months * 30;
    if (months === 2) return 'شهران (60 يوم)';
    return `${months} شهر (${days} يوم)`;
}

function getDurationDays(months) {
    return DAYS_BY_MONTHS[months] || months * 30;
}

function getPrice(months) {
    return PRICE_BY_MONTHS[months] || 0;
}

function askCodeDuration(action) {
    pendingCodeDurationAction = action;
    if (codeDurationSelect) codeDurationSelect.value = '30';
    openModal('code-duration-modal');
}

async function createActivationCode(days, ownerName = '', ownerPhone = '', deviceId = '', role = 'owner') {
    const code = generateRandomCode();
    const months = days >= 60 ? 2 : 1;
    await setDoc(doc(db, 'activation_codes', code), {
        isUsed: false,
        createdAt: serverTimestamp(),
        ownerName: ownerName,
        ownerPhone: ownerPhone,
        deviceId: deviceId,
        role: role,
        validMonths: months,
        durationDays: days,
        price: getPrice(months),
        durationLabel: getDurationLabel(months),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000)),
    });
    return code;
}

function redirectToLogin() {
    window.location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', () => {
    // إعدادات Firebase والـ Auth
    onAuthStateChanged(auth, async (user) => {
        authStateKnown = true;
        if (!user) {
            redirectToLogin();
            return;
        }

        const access = await getAdminAccess(user.email);
        if (!access.allowed) {
            await signOut(auth);
            redirectToLogin();
            return;
        }

        // تفعيل الأزرار بعد التحقق
        if (generateCodeBtn) generateCodeBtn.disabled = false;

        // عرض القسم الافتراضي
        if (dashboardSection) dashboardSection.style.display = 'block';
        if (codesSection) codesSection.style.display = 'none';

        fetchUsers();
        fetchCodes();
        fetchRequests();
        fetchNotifications();
        fetchAppUpdates();
    });

    // التنقل بين الأقسام
    if (adminNav) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target;
                // رابط الموقع العام يفتح في تبويب جديد ولا يبدّل الأقسام
                if (!target) return;
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (dashboardSection) dashboardSection.style.display = target === 'dashboard-section' ? 'block' : 'none';
                if (codesSection) codesSection.style.display = target === 'codes-section' ? 'block' : 'none';
                if (requestsSection) requestsSection.style.display = target === 'requests-section' ? 'block' : 'none';
                if (notificationsSection) notificationsSection.style.display = target === 'notifications-section' ? 'block' : 'none';
                if (updatesSection) updatesSection.style.display = target === 'updates-section' ? 'block' : 'none';
            });
        });
    }

    // تسجيل الخروج
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            redirectToLogin();
        });
    }

    // تفعيل مباشر لطلب التفعيل
    if (confirmActivateRequestBtn) {
        confirmActivateRequestBtn.addEventListener('click', async () => {
            const requestId = activateRequestId?.value || '';
            if (!requestId) return;

            const months = parseInt(activateRequestDuration?.value || '3', 10);
            const days = getDurationDays(months);
            const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

            confirmActivateRequestBtn.disabled = true;
            try {
                const reqSnap = await getDoc(doc(db, 'activation_requests', requestId));
                const reqData = reqSnap.exists() ? reqSnap.data() : {};

                const isOperator = reqData.type === 'operator';
                await setDoc(doc(db, 'devices', requestId), {
                    deviceId: requestId,
                    deviceName: reqData.deviceName || (isOperator ? 'مشغل' : 'جهاز غير معروف'),
                    ownerName: reqData.ownerName || '',
                    ownerPhone: reqData.ownerPhone || '',
                    role: isOperator ? 'operator' : 'owner',
                    activated: true,
                    expiresAt: Timestamp.fromDate(expiresAt),
                    activatedAt: serverTimestamp(),
                    validMonths: months,
                    activationCode: reqData.activationCode || null,
                    attempts: 0,
                    lockUntil: null,
                    lastSeenAt: serverTimestamp(),
                }, { merge: true });

                if (isOperator) {
                    await setDoc(doc(db, 'operator_requests', requestId), {
                        deviceId: requestId,
                        operatorName: reqData.ownerName || '',
                        operatorPhone: reqData.ownerPhone || '',
                        selfRegistered: true,
                        status: 'approved',
                        activationCode: reqData.activationCode || null,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                }

                await deleteDoc(doc(db, 'activation_requests', requestId));

                closeModal('activate-request-modal');
                showGeneralMessage('نجاح', 'تم تفعيل المستخدم مباشرة.', 'success');
                fetchRequests();
                fetchUsers();
            } catch (error) {
                showGeneralMessage('خطأ', 'فشل التفعيل: ' + error.message, 'error');
            } finally {
                confirmActivateRequestBtn.disabled = false;
            }
        });
    }

    // اختيار مدة الكود (30 أو 60 يوم)
    if (confirmCodeDurationBtn) {
        confirmCodeDurationBtn.addEventListener('click', () => {
            const days = parseInt(codeDurationSelect?.value || '30', 10);
            const action = pendingCodeDurationAction;
            pendingCodeDurationAction = null;
            closeModal('code-duration-modal');
            if (typeof action === 'function') action(days);
        });
    }

    // زر اختيار ملف APK المودرن
    function updateApkFileUI() {
        if (!apkDropzone) return;
        const file = updateApkFile?.files?.[0];
        if (file) {
            apkDropzone.classList.add('has-file');
            if (apkFileName) apkFileName.textContent = file.name;
            if (apkFileMeta) apkFileMeta.textContent = formatFileSize(file.size) + ' · جاهز للرفع';
        } else {
            apkDropzone.classList.remove('has-file');
            if (apkFileName) apkFileName.textContent = 'لم يتم اختيار ملف';
            if (apkFileMeta) apkFileMeta.textContent = 'اضغط لاختيار ملف APK أو اسحبه هنا';
        }
    }

    if (updateApkFile) {
        updateApkFile.addEventListener('change', updateApkFileUI);
    }

    if (apkDropzone && updateApkFile) {
        ['dragenter', 'dragover'].forEach((type) => {
            apkDropzone.addEventListener(type, (event) => {
                event.preventDefault();
                apkDropzone.classList.add('is-dragging');
            });
        });
        ['dragleave', 'drop'].forEach((type) => {
            apkDropzone.addEventListener(type, (event) => {
                event.preventDefault();
                apkDropzone.classList.remove('is-dragging');
            });
        });
        apkDropzone.addEventListener('drop', (event) => {
            const droppedFile = event.dataTransfer?.files?.[0];
            if (!droppedFile) return;
            const transfer = new DataTransfer();
            transfer.items.add(droppedFile);
            updateApkFile.files = transfer.files;
            updateApkFileUI();
        });
    }

    // رفع تحديث التطبيق إلى الموقع العام
    if (uploadUpdateForm) {
        uploadUpdateForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const file = updateApkFile?.files?.[0];
            const version = String(updateVersionName?.value || '').trim();
            const versionCode = parseInt(updateVersionCode?.value || '0', 10);
            const MAX_APK_SIZE = 150 * 1024 * 1024;

            if (!file) {
                showGeneralMessage('تنبيه', 'الرجاء اختيار ملف APK أولاً.', 'error');
                return;
            }
            if (!/\.apk$/i.test(file.name)) {
                showGeneralMessage('تنبيه', 'يجب أن يكون الملف بصيغة APK.', 'error');
                return;
            }
            if (!version) {
                showGeneralMessage('تنبيه', 'الرجاء إدخال اسم الإصدار.', 'error');
                return;
            }
            if (!Number.isInteger(versionCode) || versionCode < 1) {
                showGeneralMessage('تنبيه', 'الرجاء إدخال رقم إصدار صحيح أكبر من صفر.', 'error');
                return;
            }
            if (file.size > MAX_APK_SIZE) {
                showGeneralMessage('تنبيه', 'حجم الملف كبير جداً. الحد الأقصى 150 ميجابايت.', 'error');
                return;
            }

            const githubToken = String(githubTokenInput?.value || localStorage.getItem('amperkGithubToken') || '').trim();
            if (!githubToken) {
                showGeneralMessage('تنبيه', 'أدخل GitHub Personal Access Token لرفع الإصدار.', 'error');
                return;
            }

            if (uploadUpdateBtn) uploadUpdateBtn.disabled = true;
            if (uploadProgress) uploadProgress.hidden = false;
            setUploadProgress(0);

            try {
                setUploadProgress(10);
                const releaseTag = 'v' + version.replace(/[^0-9A-Za-z.-]/g, '');
                const notes = String(updateNotes?.value || '').trim() || 'تحديث تطبيق أمبيرك';
                const releaseResponse = await fetch('https://api.github.com/repos/Alidad19/app-recet/releases', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + githubToken,
                        'Accept': 'application/vnd.github+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        tag_name: releaseTag,
                        name: 'أمبيرك ' + version,
                        body: notes + '\n\nversionCode: ' + versionCode,
                        draft: false,
                        prerelease: false,
                    }),
                });

                if (!releaseResponse.ok) {
                    const errorBody = await releaseResponse.json().catch(() => ({}));
                    throw new Error(errorBody.message || 'فشل إنشاء الإصدار في GitHub (' + releaseResponse.status + ')');
                }

                const release = await releaseResponse.json();
                setUploadProgress(25);

                const uploadResponse = await fetch(
                    'https://uploads.github.com/repos/Alidad19/app-recet/releases/' + release.id + '/assets?name=Amperk.apk',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + githubToken,
                            'Accept': 'application/vnd.github+json',
                            'Content-Type': 'application/vnd.android.package-archive',
                        },
                        body: file,
                    }
                );

                if (!uploadResponse.ok) {
                    const errorBody = await uploadResponse.json().catch(() => ({}));
                    throw new Error(errorBody.message || 'فشل رفع APK إلى GitHub (' + uploadResponse.status + ')');
                }

                await uploadResponse.json();
                try { localStorage.setItem('amperkGithubToken', githubToken); } catch {}
                if (githubTokenInput) githubTokenInput.value = '';
                setUploadProgress(100);
                uploadUpdateForm.reset();
                updateApkFileUI();
                fetchAppUpdates();
                showGeneralMessage(
                    'تم الرفع بنجاح',
                    `تم نشر الإصدار ${version} على GitHub Releases. افتح صفحة التحميل من زر «موقع التطبيق».`,
                    'success'
                );
            } catch (error) {
                console.error('Error uploading app update:', error);
                showGeneralMessage('فشل الرفع', 'لم يتم رفع التحديث: ' + (error?.message || error), 'error');
            } finally {
                if (uploadUpdateBtn) uploadUpdateBtn.disabled = false;
                if (uploadProgress) {
                    setTimeout(() => {
                        uploadProgress.hidden = true;
                        setUploadProgress(0);
                    }, 1200);
                }
            }
        });
    }

    // تبديل المظهر
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        });
    }

    // استعادة المظهر
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }

    if (githubTokenInput) {
        githubTokenInput.value = localStorage.getItem('amperkGithubToken') || '';
    }

    // ... (باقي الوظائف تبقى كما هي)
});

// إبقاء الدوال خارج DOMContentLoaded لتكون متاحة
// ... (fetchUsers, fetchCodes, attachActionButtonsListeners, etc.)

// Modal handling - unified for all modals
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

// Close modal when clicking backdrop or close button
document.addEventListener('click', (e) => {
    // Close button with data-modal attribute
    const closeBtn = e.target.closest('[data-modal]');
    if (closeBtn) {
        const modalId = closeBtn.dataset.modal;
        closeModal(modalId);
        return;
    }

    // Click on modal backdrop
    if (e.target.classList.contains('modal')) {
        closeModal(e.target.id);
    }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

function fetchUsers() {
    if (!usersList) return;
    usersList.innerHTML = '<div class="empty-message">جارٍ التحميل...</div>';

    Promise.all([
        getDocs(query(collection(db, 'devices'), orderBy('lastSeenAt', 'desc'))),
        getDocs(query(collection(db, 'operator_requests'), orderBy('createdAt', 'desc'))).catch(() => null),
        getDocs(query(collection(db, 'activation_codes'), orderBy('createdAt', 'desc'))).catch(() => null),
    ])
        .then(([devicesSnapshot, operatorsSnapshot, codesSnapshot]) => {
            usersList.innerHTML = '';
            let totalUsers = 0;
            let activeUsers = 0;
            let inactiveUsers = 0;

            const deviceGroups = new Map();
            devicesSnapshot.forEach((docSnap) => {
                totalUsers += 1;
                const data = docSnap.data();
                if (data.activated) {
                    activeUsers += 1;
                } else {
                    inactiveUsers += 1;
                }

                const key = data.ownerName || '__unknown__';
                if (!deviceGroups.has(key)) {
                    deviceGroups.set(key, {
                        name: data.ownerName || 'غير محدد',
                        phone: data.ownerPhone || '',
                        devices: [],
                    });
                }
                deviceGroups.get(key).devices.push({ docSnap, data });
            });

            const operatorGroups = new Map();
            if (operatorsSnapshot) {
                operatorsSnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const status = data.status || 'pending';
                    const statusLabel =
                        status === 'code_ready' ? '🎫 كود جاهز' :
                        status === 'rejected' ? '❌ مرفوض' : '⏳ قيد الانتظار';
                    const date = data.createdAt && typeof data.createdAt.toDate === 'function'
                        ? data.createdAt.toDate().toLocaleString('en-GB')
                        : '---';

                    const key = data.selfRegistered ? '__self__' : (data.ownerName || '__unknown__');
                    if (!operatorGroups.has(key)) {
                        operatorGroups.set(key, {
                            name: data.selfRegistered ? 'تسجيل ذاتي' : (data.ownerName || 'غير محدد'),
                            phone: data.selfRegistered ? '' : (data.ownerPhone || ''),
                            operators: [],
                        });
                    }
                    operatorGroups.get(key).operators.push({ docSnap, data, status, statusLabel, date });
                });
            }

            // الكود الذي يستخدمه الجهاز: من مستند الجهاز، أو من مستند الكود المرتبط به
            const codeByDevice = new Map();
            const usedCodeIds = new Set();
            if (codesSnapshot) {
                codesSnapshot.forEach((codeDoc) => {
                    const codeData = codeDoc.data();
                    if (codeData.isUsed || codeData.used) usedCodeIds.add(codeDoc.id);
                    if (codeData.deviceId && !codeByDevice.has(codeData.deviceId)) {
                        codeByDevice.set(codeData.deviceId, codeDoc.id);
                    }
                });
            }

            const keys = Array.from(new Set([...deviceGroups.keys(), ...operatorGroups.keys()]));
            if (keys.length === 0) {
                usersList.innerHTML = '<div class="empty-message">لا يوجد مستخدمين حالياً.</div>';
                if (totalUsersCount) totalUsersCount.textContent = '0';
                if (activeUsersCount) activeUsersCount.textContent = '0';
                if (inactiveUsersCount) inactiveUsersCount.textContent = '0';
                return;
            }

            keys.forEach((key) => {
                const deviceGroup = deviceGroups.get(key);
                const operatorGroup = operatorGroups.get(key);
                const ownerName = deviceGroup ? deviceGroup.name : (operatorGroup ? operatorGroup.name : 'غير محدد');
                const ownerPhone = deviceGroup ? deviceGroup.phone : (operatorGroup ? operatorGroup.phone : '');

                const deviceRows = deviceGroup ? deviceGroup.devices.map(({ docSnap, data }) => {
                    const deviceName = data.deviceName || 'غير معروف';
                    const lastSeen = data.lastSeenAt ? data.lastSeenAt.toDate().toLocaleString('en-GB') : 'غير معروف';
                    const validMonths = data.validMonths ? `${data.validMonths} شهر` : '---';
                    const expiresAt = data.expiresAt && typeof data.expiresAt.toDate === 'function' ? data.expiresAt.toDate() : data.expiresAt;
                    const remainingDaysValue = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : '---';
                    const remainingDaysLabel = typeof remainingDaysValue === 'number' ? `${remainingDaysValue} يوم` : remainingDaysValue;
                    const extensionStatus = data.borrowNextDay ? 'مدد يوم واحد' : '---';
                    const usedCode = data.activationCode || codeByDevice.get(docSnap.id) || '---';
                    const safeId = escapeHtml(docSnap.id);
                    const safeOwner = escapeHtml(data.ownerName || '');
                    return `
                        <tr>
                            <td data-label="اسم الجهاز">
                                <div class="cell-title">${escapeHtml(deviceName)}</div>
                                <div class="cell-subtitle">${safeId}</div>
                            </td>
                            <td data-label="اسم صاحب المولدة"><span class="owner-name">${escapeHtml(data.ownerName || 'غير محدد')}</span></td>
                            <td data-label="صورة الوجه">${facePhotoCell(data.facePhotoUrl)}</td>
                            <td data-label="العنوان"><span class="cell-address">${escapeHtml(data.address || '---')}</span></td>
                            <td data-label="الموقع">${locationCell(data)}</td>
                            <td data-label="كود التفعيل"><span class="activation-code">${escapeHtml(usedCode)}</span></td>
                            <td data-label="المدة"><span class="valid-months">${validMonths}</span></td>
                            <td data-label="أيام متبقية"><span class="remaining-days">${remainingDaysLabel}</span></td>
                            <td data-label="تمديد"><span class="extension-status">${extensionStatus}</span></td>
                            <td data-label="الحالة">${data.activated ? '✅ مفعل' : '❌ غير مفعل'}</td>
                            <td data-label="آخر ظهور"><span class="last-seen">${lastSeen}</span></td>
                            <td data-label="الإجراءات">
                                <button title="تعديل" class="action-btn edit" data-id="${safeId}" data-owner="${safeOwner}" data-code="${escapeHtml(usedCode === '---' ? '' : usedCode)}" data-activated="${data.activated || false}" data-remaining-days="${typeof remainingDaysValue === 'number' ? remainingDaysValue : ''}">تعديل</button>
                                <button title="${data.activated ? 'توقيف' : 'تفعيل'}" class="action-btn toggle" data-id="${safeId}" data-name="${escapeHtml(data.ownerName || docSnap.id)}" data-activated="${data.activated || false}">${data.activated ? 'توقيف' : 'تفعيل'}</button>
                                <button title="حذف" class="action-btn delete" data-id="${safeId}" data-name="${escapeHtml(data.ownerName || docSnap.id)}">حذف</button>
                            </td>
                        </tr>
                    `;
                }).join('') : '';

                const operatorRows = operatorGroup ? operatorGroup.operators.map(({ docSnap, data, status, statusLabel, date }) => {
                    const safeId = escapeHtml(docSnap.id);
                    const codeUsed = Boolean(data.activationCode && usedCodeIds.has(data.activationCode));
                    const rowStatusLabel = codeUsed
                        ? '👤 مشغل'
                        : (status === 'approved' || status === 'activated')
                          ? '✅ مفعل'
                          : statusLabel;
                    return `
                        <tr class="draggable-operator" draggable="true" data-drag-operator="${safeId}" data-owner-key="${escapeHtml(key)}" data-current-owner="${escapeHtml(data.ownerName || '')}" data-current-phone="${escapeHtml(data.ownerPhone || '')}" title="اسحب المشغل إلى صاحب المولدة المطلوب">
                            <td data-label="اسم المشغل"><span class="drag-handle">⠿</span> ${escapeHtml(data.operatorName || '---')}</td>
                            <td data-label="صور المشغل">${operatorPhotosCell(data)}</td>
                            <td data-label="رقم هاتف المشغل" dir="ltr">${escapeHtml(data.operatorPhone || '---')}</td>
                            <td data-label="التاريخ">${escapeHtml(date)}</td>
                            <td data-label="الحالة">
                                ${rowStatusLabel}
                                ${data.activationCode ? `<div class="cell-subtitle" dir="ltr">${escapeHtml(data.activationCode)}</div>` : ''}
                            </td>
                            <td data-label="الإجراءات">
                                <button class="action-btn edit" data-operator-code="${safeId}" ${['code_ready', 'approved', 'activated'].includes(status) || codeUsed ? 'disabled' : ''}>توليد كود</button>
                                ${status === 'rejected'
                                    ? `<button class="action-btn toggle" data-operator-activate="${safeId}">تفعيل</button>`
                                    : `<button class="action-btn delete" data-operator-reject="${safeId}" ${status === 'pending' ? '' : 'disabled'}>رفض</button>`}
                                <button class="action-btn delete" data-operator-delete="${safeId}" data-owner="${escapeHtml(ownerName)}" data-operator="${escapeHtml(data.operatorName || '')}">حذف</button>
                            </td>
                        </tr>
                    `;
                }).join('') : '';

                const card = document.createElement('div');
                card.className = 'owner-group';
                card.dataset.groupKey = key;
                card.dataset.ownerName = ownerName;
                card.dataset.ownerPhone = ownerPhone;
                card.dataset.hasOwner = deviceGroup ? 'true' : 'false';
                card.innerHTML = `
                    <div class="operator-group-header">
                        <div class="operator-group-owner">
                            <div class="operator-group-title">صاحب المولدة: ${escapeHtml(ownerName)}</div>
                            ${ownerPhone ? `<div class="operator-group-phone" dir="ltr">${escapeHtml(ownerPhone)}</div>` : ''}
                        </div>
                        <span class="operator-group-count">${deviceGroup ? deviceGroup.devices.length : 0} مستخدم · ${operatorGroup ? operatorGroup.operators.length : 0} مشغل</span>
                    </div>
                    ${deviceRows ? `<div class="table-container"><table class="field-table"><tbody>${deviceRows}</tbody></table></div>` : ''}
                    ${operatorRows ? `<div class="group-subtitle">المشغلون</div><div class="table-container"><table class="field-table"><tbody>${operatorRows}</tbody></table></div>` : ''}
                `;
                usersList.appendChild(card);
            });

            if (totalUsersCount) totalUsersCount.textContent = totalUsers;
            if (activeUsersCount) activeUsersCount.textContent = activeUsers;
            if (inactiveUsersCount) inactiveUsersCount.textContent = inactiveUsers;

            attachActionButtonsListeners();
            attachOperatorButtonsListeners(usersList);
            attachDragAndDropListeners(usersList);
        })
        .catch((error) => {
            console.error('Error fetching users:', error);
            usersList.innerHTML = '<div class="empty-message error">فشل في جلب البيانات. تأكد من قواعد الحماية (Rules).</div>';
        });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[char]);
}

function facePhotoCell(url) {
    if (!url) return '---';
    const safeUrl = escapeHtml(url);
    return `<a class="face-thumb-link" href="${safeUrl}" target="_blank" rel="noopener" title="فتح الصورة"><img class="face-thumb" src="${safeUrl}" alt="صورة الوجه"></a>`;
}

function operatorPhotosCell(data) {
    const parts = [];
    const selfie = data.facePhotoUrl || data.selfieUrl || '';
    if (selfie) parts.push(facePhotoCell(selfie));
    const idLinks = [];
    if (data.idFrontUrl) idLinks.push(`<a href="${escapeHtml(data.idFrontUrl)}" target="_blank" rel="noopener">الوجه</a>`);
    if (data.idBackUrl) idLinks.push(`<a href="${escapeHtml(data.idBackUrl)}" target="_blank" rel="noopener">الظهر</a>`);
    if (idLinks.length) parts.push(`<div class="cell-subtitle">الهوية: ${idLinks.join(' · ')}</div>`);
    return parts.length ? parts.join(' ') : '---';
}

function locationCell(data) {
    const loc = data.location;
    if (!loc || (loc.latitude == null && loc.longitude == null)) {
        return data.locationLabel ? escapeHtml(data.locationLabel) : '---';
    }
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    const mapUrl = data.locationUrl || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    return `<a class="location-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">${lat.toFixed(5)}, ${lng.toFixed(5)}</a>`;
}

async function moveOperatorToOwner(operatorId, ownerName, ownerPhone) {
    await updateDoc(doc(db, 'operator_requests', operatorId), {
        ownerName,
        ownerPhone,
        updatedAt: serverTimestamp(),
    });

    const requestRef = doc(db, 'activation_requests', operatorId);
    const requestSnap = await getDoc(requestRef);
    if (requestSnap.exists()) {
        await updateDoc(requestRef, {
            ownerName,
            ownerPhone,
            updatedAt: serverTimestamp(),
        });
    }

    const deviceRef = doc(db, 'devices', operatorId);
    const deviceSnap = await getDoc(deviceRef);
    if (deviceSnap.exists()) {
        await updateDoc(deviceRef, {
            ownerName,
            ownerPhone,
            lastSeenAt: serverTimestamp(),
        });
    }
}

function attachDragAndDropListeners(container) {
    if (!container) return;
    let dragged = null;

    const isValidTarget = (card) =>
        Boolean(dragged) &&
        card.dataset.hasOwner === 'true' &&
        !['__self__', '__unknown__'].includes(card.dataset.groupKey) &&
        card.dataset.groupKey !== dragged.ownerKey;

    container.querySelectorAll('.owner-group').forEach((card) => {
        card.addEventListener('dragover', (event) => {
            if (!isValidTarget(card)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            card.classList.add('drop-target');
        });

        card.addEventListener('dragleave', (event) => {
            if (!card.contains(event.relatedTarget)) card.classList.remove('drop-target');
        });

        card.addEventListener('drop', async (event) => {
            event.preventDefault();
            card.classList.remove('drop-target');

            const dragData = dragged;
            // إفلات المشغل في مكانه الحالي أو على بطاقة غير صحيحة: لا يُعد نقلاً.
            const canDrop = isValidTarget(card);
            dragged = null;
            if (!dragData || !canDrop) return;

            try {
                await moveOperatorToOwner(dragData.operatorId, card.dataset.ownerName || '', card.dataset.ownerPhone || '');
                showGeneralMessage('تم النقل', `تم نقل المشغل إلى «${card.dataset.ownerName || 'صاحب المولدة'}».`, 'success');
                fetchUsers();
            } catch (error) {
                console.error('Error moving operator:', error);
                showGeneralMessage('فشل النقل', 'تعذر نقل المشغل: ' + (error?.message || error), 'error');
            }
        });
    });

    container.querySelectorAll('[data-drag-operator]').forEach((row) => {
        row.addEventListener('dragstart', (event) => {
            dragged = {
                operatorId: row.dataset.dragOperator,
                ownerKey: row.dataset.ownerKey,
                ownerName: row.dataset.currentOwner || '',
                ownerPhone: row.dataset.currentPhone || '',
            };
            event.dataTransfer.setData('text/operator-id', dragged.operatorId);
            event.dataTransfer.effectAllowed = 'move';
            row.classList.add('dragging');
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            container.querySelectorAll('.owner-group').forEach((card) => card.classList.remove('drop-target'));
            dragged = null;
        });
    });
}

function fetchRequests() {
    if (!requestsList) return;
    requestsList.innerHTML = '<tr><td class="table-message" colspan="9" style="text-align:center">جارٍ التحميل...</td></tr>';

    getDocs(query(collection(db, 'activation_requests'), orderBy('createdAt', 'desc')))
        .then((querySnapshot) => {
            requestsList.innerHTML = '';
            let pending = 0;

            if (querySnapshot.empty) {
                requestsList.innerHTML = '<tr><td class="table-message" colspan="9" style="text-align:center">لا توجد طلبات تفعيل حالياً.</td></tr>';
                if (pendingRequestsCount) pendingRequestsCount.textContent = '0';
                return;
            }

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                // طلبات المشغلين تظهر في قسم «المشغلون» فقط
                if (data.type === 'operator') return;
                const status = data.status || 'pending';
                // الطلب المكتمل ينتقل إلى قائمة المستخدمين ولا يظهر هنا
                if (status === 'approved' || status === 'activated') return;
                if (status === 'pending') pending += 1;

                const statusLabel =
                    status === 'approved' ? '✅ مفعل' :
                    status === 'code_ready' ? '🎫 كود جاهز' :
                    status === 'rejected' ? '❌ مرفوض' : '⏳ قيد الانتظار';

                // ترقية الأكواد القديمة: ربط الكود بصاحب الطلب إذا كان الاسم مفقوداً
                if (status === 'code_ready' && data.activationCode) {
                    const codeRef = doc(db, 'activation_codes', data.activationCode);
                    getDoc(codeRef).then((codeSnap) => {
                        if (codeSnap.exists() && !codeSnap.data().ownerName) {
                            return updateDoc(codeRef, {
                                ownerName: data.ownerName || '',
                                ownerPhone: data.ownerPhone || '',
                                deviceId: docSnap.id,
                            });
                        }
                    }).catch(() => {});
                }

                const date = data.createdAt && typeof data.createdAt.toDate === 'function'
                    ? data.createdAt.toDate().toLocaleString('en-GB')
                    : '---';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td data-label="الجهاز">
                        <div class="cell-title">${escapeHtml(data.deviceName || 'جهاز غير معروف')}</div>
                        <div class="cell-subtitle">${escapeHtml(docSnap.id)}</div>
                    </td>
                    <td data-label="اسم صاحب المولدة">${escapeHtml(data.ownerName || '---')}</td>
                    <td data-label="صورة الوجه">${facePhotoCell(data.facePhotoUrl)}</td>
                    <td data-label="رقم الهاتف" dir="ltr">${escapeHtml(data.ownerPhone || '---')}</td>
                    <td data-label="العنوان"><span class="cell-address">${escapeHtml(data.address || '---')}</span></td>
                    <td data-label="الموقع">${locationCell(data)}</td>
                    <td data-label="التاريخ">${escapeHtml(date)}</td>
                    <td data-label="الحالة">
                        ${statusLabel}
                        ${data.activationCode ? `<div class="cell-subtitle" dir="ltr">${escapeHtml(data.activationCode)}</div>` : ''}
                    </td>
                    <td data-label="الإجراءات">
                        <button class="action-btn toggle" data-request-activate="${escapeHtml(docSnap.id)}" data-name="${escapeHtml(data.ownerName || docSnap.id)}" ${status === 'approved' ? 'disabled' : ''}>تفعيل مباشر</button>
                        <button class="action-btn edit" data-request-code="${escapeHtml(docSnap.id)}" ${status === 'approved' ? 'disabled' : ''}>توليد كود</button>
                        ${status === 'rejected'
                            ? `<button class="action-btn toggle" data-request-reactivate="${escapeHtml(docSnap.id)}" data-name="${escapeHtml(data.ownerName || docSnap.id)}">تفعيل</button>`
                            : `<button class="action-btn delete" data-request-reject="${escapeHtml(docSnap.id)}" ${status === 'pending' ? '' : 'disabled'}>رفض</button>`}
                    </td>
                `;
                requestsList.appendChild(row);
            });

            if (pendingRequestsCount) pendingRequestsCount.textContent = String(pending);

            requestsList.querySelectorAll('[data-request-activate], [data-request-reactivate]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const requestId = btn.dataset.requestActivate || btn.dataset.requestReactivate;
                    if (activateRequestId) activateRequestId.value = requestId;
                    if (activateRequestName) activateRequestName.textContent = btn.dataset.name || '';
                    if (activateRequestDuration) activateRequestDuration.value = '3';
                    openModal('activate-request-modal');
                });
            });

            requestsList.querySelectorAll('[data-request-code]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const requestId = btn.dataset.requestCode;
                    askCodeDuration(async (days) => {
                        try {
                            const reqSnap = await getDoc(doc(db, 'activation_requests', requestId));
                            const reqData = reqSnap.exists() ? reqSnap.data() : {};
                            const code = await createActivationCode(
                                days,
                                reqData.ownerName || '',
                                reqData.ownerPhone || '',
                                requestId,
                                reqData.type === 'operator' ? 'operator' : 'owner'
                            );
                            await updateDoc(doc(db, 'activation_requests', requestId), {
                                status: 'code_ready',
                                activationCode: code,
                                updatedAt: serverTimestamp(),
                            });
                            showGeneralMessage('تم التوليد', `الكود ${code} لمدة ${days} يوم جاهز. أعطه للمستخدم لإتمام التفعيل.`, 'success');
                            fetchRequests();
                            fetchCodes();
                        } catch (error) {
                            showGeneralMessage('خطأ', 'فشل توليد الكود: ' + error.message, 'error');
                        }
                    });
                });
            });

            requestsList.querySelectorAll('[data-request-reject]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    try {
                        await updateDoc(doc(db, 'activation_requests', btn.dataset.requestReject), {
                            status: 'rejected',
                            updatedAt: serverTimestamp(),
                        });
                        fetchRequests();
                    } catch (error) {
                        showGeneralMessage('خطأ', 'فشل رفض الطلب: ' + error.message, 'error');
                    }
                });
            });
        })
        .catch((error) => {
            console.error('Error fetching requests:', error);
            requestsList.innerHTML = '<tr><td class="table-message" colspan="9" style="color:red; text-align:center">فشل في جلب الطلبات. تأكد من قواعد Firestore.</td></tr>';
        });
}

function attachOperatorButtonsListeners(container) {
    if (!container) return;

    container.querySelectorAll('[data-operator-code]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const requestId = btn.dataset.operatorCode;
            askCodeDuration(async (days) => {
                try {
                    const reqSnap = await getDoc(doc(db, 'operator_requests', requestId));
                    const reqData = reqSnap.exists() ? reqSnap.data() : {};
                    // المشغل الذي أضافه صاحب المولدة لا يعرف جهازه بعد، لذلك يُربط الكود بأول جهاز يفعّله.
                    // أما المشغل المسجّل ذاتياً فمعرّف طلبه هو معرّف جهازه.
                    const code = await createActivationCode(
                        days,
                        reqData.operatorName || '',
                        reqData.operatorPhone || '',
                        reqData.selfRegistered ? requestId : '',
                        'operator'
                    );
                    await updateDoc(doc(db, 'operator_requests', requestId), {
                        status: 'code_ready',
                        activationCode: code,
                        updatedAt: serverTimestamp(),
                    });
                    // تحديث طلب التطبيق حتى يظهر الكود للمشغل على الهاتف
                    await setDoc(doc(db, 'activation_requests', requestId), {
                        deviceId: requestId,
                        ownerName: reqData.operatorName || '',
                        ownerPhone: reqData.operatorPhone || '',
                        type: 'operator',
                        status: 'code_ready',
                        activationCode: code,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                    showGeneralMessage('تم التوليد', `الكود ${code} لمدة ${days} يوم جاهز للمشغل.`, 'success');
                    fetchUsers();
                    fetchCodes();
                } catch (error) {
                    showGeneralMessage('خطأ', 'فشل توليد الكود: ' + error.message, 'error');
                }
            });
        });
    });

    container.querySelectorAll('[data-operator-reject]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            try {
                await updateDoc(doc(db, 'operator_requests', btn.dataset.operatorReject), {
                    status: 'rejected',
                    updatedAt: serverTimestamp(),
                });
                fetchUsers();
            } catch (error) {
                showGeneralMessage('خطأ', 'فشل رفض الطلب: ' + error.message, 'error');
            }
        });
    });

    container.querySelectorAll('[data-operator-activate]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const operatorId = btn.dataset.operatorActivate;
            askCodeDuration(async (days) => {
                try {
                    const reqSnap = await getDoc(doc(db, 'operator_requests', operatorId));
                    const reqData = reqSnap.exists() ? reqSnap.data() : {};
                    const deviceId = reqData.deviceId || operatorId;
                    const months = days >= 60 ? 2 : 1;

                    await setDoc(doc(db, 'devices', deviceId), {
                        deviceId,
                        deviceName: reqData.deviceName || 'مشغل',
                        ownerName: reqData.operatorName || reqData.ownerName || '',
                        ownerPhone: reqData.operatorPhone || reqData.ownerPhone || '',
                        role: 'operator',
                        activated: true,
                        expiresAt: Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000)),
                        activatedAt: serverTimestamp(),
                        validMonths: months,
                        activationCode: reqData.activationCode || null,
                        attempts: 0,
                        lockUntil: null,
                        lastSeenAt: serverTimestamp(),
                    }, { merge: true });

                    await updateDoc(doc(db, 'operator_requests', operatorId), {
                        status: 'approved',
                        updatedAt: serverTimestamp(),
                    });

                    showGeneralMessage('تم التفعيل', 'تم تفعيل المشغل مباشرة دون استخدام كود.', 'success');
                    fetchUsers();
                } catch (error) {
                    showGeneralMessage('خطأ', 'فشل تفعيل المشغل: ' + error.message, 'error');
                }
            });
        });
    });

    container.querySelectorAll('[data-operator-delete]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const owner = btn.dataset.owner || '---';
            const operator = btn.dataset.operator || '---';
            if (!confirm(`حذف المشغل ${operator}؟`)) return;
            try {
                await deleteDoc(doc(db, 'operator_requests', btn.dataset.operatorDelete));
                await addDoc(collection(db, 'admin_notifications'), {
                    type: 'operator_deleted',
                    message: `صاحب المولدة ${owner} حذف المشغل ${operator}`,
                    ownerName: owner === '---' ? '' : owner,
                    operatorName: operator === '---' ? '' : operator,
                    createdAt: serverTimestamp(),
                    expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
                });
                showGeneralMessage('تم', `صاحب المولدة ${owner} حذف المشغل ${operator}`, 'success');
                fetchUsers();
                fetchNotifications();
            } catch (error) {
                showGeneralMessage('خطأ', 'فشل حذف المشغل: ' + error.message, 'error');
            }
        });
    });
}

function fetchNotifications() {
    if (!notificationsList) return;
    notificationsList.innerHTML = '<div class="empty-message">جارٍ التحميل...</div>';

    getDocs(query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc')))
        .then(async (querySnapshot) => {
            const now = Date.now();
            const activeDocs = [];
            const expiredIds = [];

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const createdMs = data.createdAt && typeof data.createdAt.toDate === 'function'
                    ? data.createdAt.toDate().getTime()
                    : 0;
                const expiresMs = data.expiresAt && typeof data.expiresAt.toDate === 'function'
                    ? data.expiresAt.toDate().getTime()
                    : (createdMs ? createdMs + 24 * 60 * 60 * 1000 : now + 1);
                if (expiresMs <= now) expiredIds.push(docSnap.id);
                else activeDocs.push(docSnap);
            });

            // الإشعارات فقط تُحذف بعد يوم واحد من تاريخ إنشائها
            if (expiredIds.length) {
                await Promise.all(
                    expiredIds.map((id) =>
                        deleteDoc(doc(db, 'admin_notifications', id)).catch(() => null)
                    )
                );
            }

            notificationsList.innerHTML = '';
            if (activeDocs.length === 0) {
                notificationsList.innerHTML = '<div class="empty-message">لا توجد إشعارات حالياً.</div>';
                return;
            }

            activeDocs.forEach((docSnap) => {
                const data = docSnap.data();
                const date = data.createdAt && typeof data.createdAt.toDate === 'function'
                    ? data.createdAt.toDate().toLocaleString('en-GB')
                    : '---';
                const item = document.createElement('div');
                item.className = 'notification-item';
                item.innerHTML = `
                    <div class="notification-message">${escapeHtml(data.message || '---')}</div>
                    <div class="notification-date">${escapeHtml(date)}</div>
                `;
                notificationsList.appendChild(item);
            });
        })
        .catch((error) => {
            console.error('Error fetching notifications:', error);
            notificationsList.innerHTML = '<div class="empty-message error">فشل في جلب الإشعارات. تأكد من قواعد Firestore.</div>';
        });
}

function fetchCodes() {
    if (!codesList) return;
    codesList.innerHTML = '<tr><td class="table-message" colspan="6" style="text-align:center">جارٍ التحميل...</td></tr>';

    Promise.all([
        getDocs(query(collection(db, 'activation_codes'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'operator_requests')).catch(() => null),
        getDocs(collection(db, 'activation_requests')).catch(() => null),
    ])
        .then(([querySnapshot, operatorsSnapshot, requestsSnapshot]) => {
            codesList.innerHTML = '';
            if (querySnapshot.empty) {
                codesList.innerHTML = '<tr><td class="table-message" colspan="8" style="text-align:center">لا توجد أكواد حالياً.</td></tr>';
                if (soldCodesCount) soldCodesCount.textContent = '0';
                if (totalRevenueCount) totalRevenueCount.textContent = formatCurrency(0);
                return;
            }
            let totalCodes = 0;
            let availableCodes = 0;
            let soldCodes = 0;
            let totalRevenue = 0;

            // تحديد من استخدم الكود: صاحب مولدة أم مشغل
            const roleByCode = new Map();
            if (operatorsSnapshot) {
                operatorsSnapshot.forEach((item) => {
                    const code = item.data().activationCode;
                    if (code) roleByCode.set(code, 'operator');
                });
            }
            if (requestsSnapshot) {
                requestsSnapshot.forEach((item) => {
                    const data = item.data();
                    if (data.activationCode) {
                        roleByCode.set(data.activationCode, data.type === 'operator' ? 'operator' : 'owner');
                    }
                });
            }

            querySnapshot.forEach((docSnap) => {
                totalCodes += 1;
                const data = docSnap.data();
                const isUsed = Boolean(data.isUsed || data.used);
                if (!isUsed) {
                    availableCodes += 1;
                } else {
                    soldCodes += 1;
                    totalRevenue += Number(data.price || 0);
                }
                const usedBy = roleByCode.get(docSnap.id) || data.role || 'owner';
                const statusCell = isUsed
                    ? `<span style="color:red">تم استخدامها</span><div class="cell-subtitle">مستخدم ${usedBy === 'operator' ? 'للمشغل' : 'لصاحب المولد'}</div>`
                    : '<span style="color:green">لم يتم استخدامها</span>';
                const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString('en-GB') : '---';
                const durationLabel = data.durationLabel || (data.validMonths ? `${data.validMonths} شهر` : '---');
                const durationDays = data.durationDays || (data.validMonths ? data.validMonths * 30 : '---');
                const priceLabel = data.price != null ? formatCurrency(Number(data.price)) : '---';
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td data-label="الكود" style="font-weight:bold; color:#6A82FF; letter-spacing:1px;">${docSnap.id}</td>
                    <td data-label="الحالة">${statusCell}</td>
                    <td data-label="المدة">${durationLabel}</td>
                    <td data-label="عدد الأيام">${durationDays !== '---' ? `${durationDays} يوم` : '---'}</td>
                    <td data-label="السعر">${priceLabel}</td>
                    <td data-label="المشترك">${data.ownerName || '---'}</td>
                    <td data-label="تاريخ الإنشاء">${date}</td>
                    <td data-label="الإجراءات">
                        ${isUsed ? '' : `<button class="action-btn toggle" data-code-activate="${docSnap.id}">تفعيل بالكود</button>`}
                        <button class="action-btn delete-code" data-id="${docSnap.id}">حذف</button>
                    </td>
                `;
                codesList.appendChild(row);
            });

            if (totalCodesCount) totalCodesCount.textContent = totalCodes;
            if (availableCodesCount) availableCodesCount.textContent = availableCodes;
            if (soldCodesCount) soldCodesCount.textContent = soldCodes;
            if (totalRevenueCount) totalRevenueCount.textContent = formatCurrency(totalRevenue);

            codesList.querySelectorAll('.delete-code').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm(`هل أنت متأكد من حذف الكود ${btn.dataset.id}?`)) {
                        await deleteDoc(doc(db, 'activation_codes', btn.dataset.id));
                        fetchCodes();
                    }
                });
            });

            // تفعيل الطلب المرتبط بالكود المولّد دون استهلاك الكود،
            // حتى يظل صالحاً لإدخاله المشغل على هاتفه.
            codesList.querySelectorAll('[data-code-activate]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const codeId = btn.dataset.codeActivate;
                    try {
                        const [opSnap, reqSnap] = await Promise.all([
                            getDocs(query(collection(db, 'operator_requests'), where('activationCode', '==', codeId))),
                            getDocs(query(collection(db, 'activation_requests'), where('activationCode', '==', codeId))),
                        ]);

                        if (opSnap.empty && reqSnap.empty) {
                            showGeneralMessage('تنبيه', 'لا يوجد طلب مرتبط بهذا الكود.', 'error');
                            return;
                        }

                        const updates = [];
                        opSnap.forEach((item) => updates.push(updateDoc(doc(db, 'operator_requests', item.id), {
                            status: 'approved',
                            updatedAt: serverTimestamp(),
                        })));
                        reqSnap.forEach((item) => updates.push(updateDoc(doc(db, 'activation_requests', item.id), {
                            status: 'approved',
                            updatedAt: serverTimestamp(),
                        })));
                        await Promise.all(updates);

                        showGeneralMessage('تم التفعيل', `تم تفعيل الطلب المرتبط بالكود ${codeId}. الكود ما زال صالحاً للاستخدام على الهاتف.`, 'success');
                        fetchRequests();
                        fetchUsers();
                        fetchCodes();
                    } catch (error) {
                        console.error('Error activating by code:', error);
                        showGeneralMessage('خطأ', 'فشل التفعيل بالكود: ' + error.message, 'error');
                    }
                });
            });
        })
        .catch((error) => {
            console.error('Error fetching codes:', error);
            let message = 'فشل في جلب الأكواد.';
            if (error.code === 'permission-denied' || error.message?.includes('permission')) {
                message = 'ليس لديك صلاحية عرض الأكواد. تأكد من قواعد Firestore: يجب السماح للقراءة في مجموعة activation_codes.';
            }
            codesList.innerHTML = `<tr><td class="table-message" colspan="8" style="color:red; text-align:center">${message}</td></tr>`;
        });
}

function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function attachActionButtonsListeners() {
    if (!usersList) return;
    usersList.querySelectorAll('.action-btn.edit[data-id]').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const owner = e.target.dataset.owner;
            const code = e.target.dataset.code || '';
            const activated = e.target.dataset.activated === 'true';
            const remainingDays = e.target.dataset.remainingDays || '';
            openEditUserModal(id, owner, activated, remainingDays, code);
        });
    });

    usersList.querySelectorAll('.action-btn.delete[data-id]').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const name = e.target.dataset.name;
            openDeleteUserModal(id, name);
        });
    });

    usersList.querySelectorAll('.action-btn.toggle[data-id]').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const name = e.target.dataset.name;
            const activated = e.target.dataset.activated === 'true';
            openToggleActivationModal(id, name, activated);
        });
    });
}

function openEditUserModal(id, owner, activated, remainingDays = '', activationCode = '') {
    if (!editUserModal) return;
    editUserId.value = id;
    editOwnerName.value = owner;
    if (editActivationCode) editActivationCode.value = activationCode;
    if (editRemainingDays) editRemainingDays.value = remainingDays;
    editActivated.checked = activated;
    editError.textContent = '';
    openModal('edit-user-modal');
}

if (editUserForm) {
    editUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = editUserId.value;
        const newOwnerName = editOwnerName.value.trim();
        const newActivationCode = editActivationCode ? editActivationCode.value.trim() : '';
        const newActivatedStatus = editActivated.checked;
        editError.textContent = '';

        if (!newOwnerName) {
            editError.textContent = 'الرجاء تعبئة اسم صاحب المولدة.';
            return;
        }

        try {
            const userRef = doc(db, 'devices', id);
            const updatePayload = {
                ownerName: newOwnerName,
                activated: newActivatedStatus,
                lastSeenAt: Timestamp.now()
            };
            updatePayload.activationCode = newActivationCode;
            const remainingDaysInput = editRemainingDays ? editRemainingDays.value.trim() : '';
            const remainingDays = remainingDaysInput ? Number(remainingDaysInput) : NaN;
            if (!Number.isNaN(remainingDays) && remainingDays >= 0) {
                const expiresAtDate = new Date(Date.now() + remainingDays * 24 * 60 * 60 * 1000);
                updatePayload.expiresAt = Timestamp.fromDate(expiresAtDate);
            }
            await updateDoc(userRef, updatePayload);
            closeModal('edit-user-modal');
            fetchUsers();
            showGeneralMessage('نجاح', 'تم تحديث بيانات المستخدم بنجاح.', 'success');
        } catch (error) {
            console.error('Error updating user:', error);
            editError.textContent = 'فشل تحديث المستخدم: ' + error.message;
        }
    });
}

let userIdToDelete = null;
function openDeleteUserModal(id, name) {
    userIdToDelete = id;
    deleteUserName.textContent = name;
    openModal('delete-confirm-modal');
}

if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
        if (!userIdToDelete) return;
        try {
            await deleteDoc(doc(db, 'devices', userIdToDelete));
            closeModal('delete-confirm-modal');
            fetchUsers();
            showGeneralMessage('نجاح', 'تم حذف المستخدم بنجاح.', 'success');
        } catch (error) {
            console.error('Error deleting user:', error);
            showGeneralMessage('خطأ', 'فشل حذف المستخدم: ' + error.message, 'error');
        } finally {
            userIdToDelete = null;
        }
    });
}

let userIdToToggle = null;
let currentActivationStatus = false;
function openToggleActivationModal(id, name, activated) {
    userIdToToggle = id;
    currentActivationStatus = activated;

    const title = document.getElementById('toggle-activation-title');
    const actionText = document.getElementById('toggle-activation-action-text');
    const userName = document.getElementById('toggle-activation-user-name');
    const note = document.getElementById('toggle-activation-note');
    const header = document.getElementById('toggle-modal-header');
    const icon = document.getElementById('toggle-modal-icon');

    userName.textContent = name;

    if (activated) {
        // Currently active -> will deactivate
        title.textContent = 'توقيف المستخدم';
        actionText.textContent = 'إيقاف';
        note.textContent = 'سيتم إيقاف وصول المستخدم للتطبيق.';
        header.className = 'modal-header warning';
        icon.innerHTML = `
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="20" height="20" rx="5.68"></rect>
                <line x1="2" y1="12" x2="22" y2="12"></line>
            </svg>
        `;
    } else {
        // Currently inactive -> will activate
        title.textContent = 'تفعيل المستخدم';
        actionText.textContent = 'تفعيل';
        note.textContent = 'سيتم منح المستخدم وصولاً للتطبيق.';
        header.className = 'modal-header success';
        icon.innerHTML = `
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
        `;
    }

    openModal('toggle-activation-modal');
}

if (confirmToggleActivationBtn) {
    confirmToggleActivationBtn.addEventListener('click', async () => {
        if (!userIdToToggle) return;
        try {
            const userRef = doc(db, 'devices', userIdToToggle);
            await updateDoc(userRef, {
                activated: !currentActivationStatus,
                lastSeenAt: Timestamp.now()
            });
            closeModal('toggle-activation-modal');
            fetchUsers();
            showGeneralMessage('نجاح', `تم ${!currentActivationStatus ? 'تفعيل' : 'توقيف'} المستخدم بنجاح.`, 'success');
        } catch (error) {
            console.error('Error toggling activation:', error);
            showGeneralMessage('خطأ', 'فشل تغيير حالة التفعيل: ' + error.message, 'error');
        } finally {
            userIdToToggle = null;
        }
    });
}

function showGeneralMessage(title, message, type = 'info') {
    if (!generalMessageModal) return;
    generalMessageTitle.textContent = title;
    generalMessageText.textContent = message;
    const header = document.getElementById('general-modal-header');
    header.className = 'modal-header ' + type;
    openModal('general-message-modal');
}

// توليد كود تفعيل جديد
if (generateCodeBtn) {
    const generateBtnHtml = generateCodeBtn.innerHTML;

    generateCodeBtn.addEventListener('click', () => {
        askCodeDuration(async (days) => {
            try {
                generateCodeBtn.disabled = true;
                generateCodeBtn.textContent = 'جاري التوليد...';

                const newCode = await createActivationCode(days);

                showGeneralMessage('تم التوليد', `تم إنشاء كود جديد لمدة ${days} يوم: ${newCode}`, 'success');
                fetchCodes();
            } catch (error) {
                console.error('Error generating code:', error);
                showGeneralMessage('خطأ', 'فشل في توليد الكود: ' + error.message, 'error');
            } finally {
                generateCodeBtn.disabled = false;
                generateCodeBtn.innerHTML = generateBtnHtml;
            }
        });
    });
}

// ===== تحديثات التطبيق المنشورة في الموقع العام =====

function setUploadProgress(percent) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    if (uploadProgressFill) uploadProgressFill.style.width = value + '%';
    if (uploadProgressText) uploadProgressText.textContent = value + '%';
}

function formatFileSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} بايت`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} كيلوبايت`;
    return `${(size / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function formatUpdateDate(value) {
    if (!value) return '---';
    if (typeof value.toDate === 'function') return value.toDate().toLocaleString('en-GB');
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-GB');
    return String(value);
}

function fetchAppUpdates() {
    if (!updatesList) return;
    updatesList.innerHTML = '<tr><td class="table-message" colspan="5" style="text-align:center">جارٍ التحميل...</td></tr>';

    fetch('https://api.github.com/repos/Alidad19/app-recet/releases?per_page=20', {
        headers: { 'Accept': 'application/vnd.github+json' },
    })
        .then((response) => {
            if (!response.ok) throw new Error('GitHub API ' + response.status);
            return response.json();
        })
        .then((releases) => {
            const entries = releases.map((release) => {
                const apk = (release.assets || []).find((asset) => /\.apk$/i.test(asset.name));
                const codeMatch = String(release.body || '').match(/versionCode:\s*(\d+)/i);
                return {
                    version: String(release.tag_name || '').replace(/^v/, ''),
                    versionCode: codeMatch ? codeMatch[1] : '---',
                    size: apk ? apk.size : 0,
                    uploadedAt: release.published_at || release.created_at,
                    uploadedBy: release.author?.login || '---',
                    notes: String(release.body || '').replace(/\n\nversionCode:\s*\d+/i, '').trim(),
                    releaseUrl: release.html_url,
                };
            });

            const current = entries[0] || null;
            if (current) {
                const versionLabel = current.version ? `الإصدار ${current.version}` : '---';
                const codeLabel = current.versionCode !== '---' ? ` (#${current.versionCode})` : '';
                if (currentVersionName) currentVersionName.textContent = versionLabel + codeLabel;
                if (currentVersionNotes) currentVersionNotes.textContent = current.notes || 'لا توجد ملاحظات لهذا الإصدار.';
                if (currentVersionMeta) {
                    currentVersionMeta.textContent = [
                        current.size ? `الحجم: ${formatFileSize(current.size)}` : '',
                        current.uploadedAt ? `تاريخ النشر: ${formatUpdateDate(current.uploadedAt)}` : '',
                    ].filter(Boolean).join(' • ') || '---';
                }
            } else {
                if (currentVersionName) currentVersionName.textContent = 'لا يوجد تحديث منشور';
                if (currentVersionNotes) currentVersionNotes.textContent = 'ارفع ملف APK ليظهر في صفحة الموقع العام.';
                if (currentVersionMeta) currentVersionMeta.textContent = '';
            }

            updatesList.innerHTML = '';
            if (entries.length === 0) {
                updatesList.innerHTML = '<tr><td class="table-message" colspan="5" style="text-align:center">لا توجد إصدارات مرفوعة بعد.</td></tr>';
                return;
            }

            entries.forEach((data) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${escapeHtml(data.version)}</td>
                    <td>${escapeHtml(String(data.versionCode))}</td>
                    <td>${escapeHtml(formatFileSize(data.size))}</td>
                    <td>${escapeHtml(formatUpdateDate(data.uploadedAt))}</td>
                    <td>${escapeHtml(data.uploadedBy)}</td>
                `;
                updatesList.appendChild(row);
            });
        })
        .catch((error) => {
            console.error('Error fetching app updates:', error);
            updatesList.innerHTML = '<tr><td class="table-message" colspan="5" style="text-align:center">فشل في جلب الإصدارات من GitHub.</td></tr>';
        });
}
