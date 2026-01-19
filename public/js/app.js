// Main Application Logic
let currentUser = null;
let contacts = {};
let activeCall = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initServiceWorker();
  setupEventListeners();
});

// === AUTHENTICATION ===

function initAuth() {
  // Check auth state
  auth.onAuthStateChanged((user) => {
    if (user) {
      currentUser = user;
      checkUserProfile(user.uid);
    } else {
      UI.showScreen(UI.authScreen);
    }
  });
}

async function signInWithGoogle() {
  try {
    const result = await auth.signInWithPopup(googleProvider);
    currentUser = result.user;
    checkUserProfile(result.user.uid);
  } catch (error) {
    console.error('Error signing in with Google:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      alert('Ошибка входа через Google. Попробуйте еще раз.');
    }
  }
}

async function checkUserProfile(uid) {
  const userRef = db.ref(`users/${uid}`);
  const snapshot = await userRef.once('value');
  const userData = snapshot.val();

  if (!userData || !userData.name) {
    // First time user - show name setup
    UI.showScreen(UI.nameScreen);
  } else {
    // Existing user - load main screen
    loadMainScreen(uid);
  }
}

async function saveUserName(name) {
  const uid = currentUser.uid;
  await db.ref(`users/${uid}`).set({
    name: name,
    email: currentUser.email,
    status: 'online',
    lastSeen: Date.now()
  });

  loadMainScreen(uid);
}

async function loadMainScreen(uid) {
  // Set user online
  await db.ref(`users/${uid}`).update({
    status: 'online',
    lastSeen: Date.now()
  });

  // Load contacts
  loadContacts(uid);

  // Listen for incoming calls
  listenForIncomingCalls(uid);

  // Handle share link if present
  handleShareLink();

  UI.showScreen(UI.mainScreen);
}

// === CONTACTS ===

function loadContacts(uid) {
  const contactsRef = db.ref(`contacts/${uid}`);
  contactsRef.on('value', async (snapshot) => {
    const contactIds = snapshot.val() || {};
    contacts = {};

    // Load each contact's data
    for (const contactId in contactIds) {
      const contactData = await db.ref(`users/${contactId}`).once('value');
      const contact = contactData.val();
      if (contact) {
        contacts[contactId] = {
          ...contact,
          displayName: contactIds[contactId].displayName || contact.name
        };
      }
    }

    UI.renderContacts(contacts);
  });
}

async function addContactByEmail(email) {
  if (!email || email === currentUser.email) {
    UI.showError('Некорректный email');
    return;
  }

  // Find user by email
  const usersRef = db.ref('users');
  const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
  const users = snapshot.val();

  if (!users) {
    UI.showError('Пользователь с таким email не найден');
    return;
  }

  const contactUid = Object.keys(users)[0];
  const contactData = users[contactUid];

  // Add mutual contacts
  await db.ref(`contacts/${currentUser.uid}/${contactUid}`).set({
    displayName: contactData.name,
    addedAt: Date.now()
  });

  await db.ref(`contacts/${contactUid}/${currentUser.uid}`).set({
    displayName: (await db.ref(`users/${currentUser.uid}/name`).once('value')).val(),
    addedAt: Date.now()
  });

  UI.hideModal(UI.addContactModal);
  document.getElementById('contact-email-input').value = '';
}

function handleShareLink() {
  const urlParams = new URLSearchParams(window.location.search);
  const sharedUid = urlParams.get('share');

  if (sharedUid && sharedUid !== currentUser.uid) {
    addContactByUid(sharedUid);
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function addContactByUid(contactUid) {
  const contactData = await db.ref(`users/${contactUid}`).once('value');
  const contact = contactData.val();

  if (!contact) {
    alert('Контакт не найден');
    return;
  }

  // Add mutual contacts
  await db.ref(`contacts/${currentUser.uid}/${contactUid}`).set({
    displayName: contact.name,
    addedAt: Date.now()
  });

  await db.ref(`contacts/${contactUid}/${currentUser.uid}`).set({
    displayName: (await db.ref(`users/${currentUser.uid}/name`).once('value')).val(),
    addedAt: Date.now()
  });
}

function generateShareLink() {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?share=${currentUser.uid}`;
}

// === CALLING ===

async function initiateCall(calleeUid) {
  const callee = contacts[calleeUid];
  if (!callee) return;

  // Create call record
  const callId = db.ref('calls').push().key;
  activeCall = {
    id: callId,
    callee: calleeUid,
    calleeName: callee.displayName || callee.name
  };

  await db.ref(`calls/${callId}`).set({
    caller: currentUser.uid,
    callee: calleeUid,
    status: 'ringing',
    createdAt: Date.now()
  });

  // Update user status
  await db.ref(`users/${currentUser.uid}`).update({ status: 'in-call' });

  // Show outgoing call screen
  UI.showOutgoingCall(activeCall.calleeName);

  // Create WebRTC offer
  await WebRTCManager.createOffer(callId);

  // Listen for call status changes
  listenForCallStatus(callId);
}

function listenForIncomingCalls(uid) {
  console.log('🎧 Setting up incoming call listener for UID:', uid);
  console.log('🎧 Browser:', navigator.userAgent.includes('Safari') ? 'Safari' : 'Other');

  const callsRef = db.ref('calls');

  // Firebase real-time listener
  callsRef.orderByChild('callee').equalTo(uid).on('child_added', async (snapshot) => {
    console.log('📞 New call detected:', snapshot.key);
    const call = snapshot.val();
    console.log('📞 Call data:', call);

    if (call.status === 'ringing') {
      console.log('📞 Call is ringing, fetching caller data...');
      const callerData = await db.ref(`users/${call.caller}`).once('value');
      const caller = callerData.val();
      console.log('📞 Caller:', caller);

      activeCall = {
        id: snapshot.key,
        caller: call.caller,
        callerName: caller.name
      };

      console.log('📞 Showing incoming call UI for:', caller.name);
      UI.showIncomingCall(caller.name);
    } else {
      console.log('📞 Call status is not ringing:', call.status);
    }
  });

  console.log('✅ Incoming call listener activated');

  // Additional polling for Safari (backup mechanism)
  if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
    console.log('🎧 Safari detected - enabling backup polling mechanism');
    let lastCheckedTime = Date.now();

    setInterval(async () => {
      console.log('🔄 Polling for incoming calls...');
      try {
        const snapshot = await callsRef
          .orderByChild('callee')
          .equalTo(uid)
          .once('value');

        const calls = snapshot.val();
        if (calls) {
          for (const callId in calls) {
            const call = calls[callId];
            // Check if call is new (created after last check) and ringing
            if (call.status === 'ringing' && call.createdAt > lastCheckedTime) {
              console.log('📞 [Polling] Found new ringing call:', callId);

              if (!activeCall) {
                const callerData = await db.ref(`users/${call.caller}`).once('value');
                const caller = callerData.val();

                activeCall = {
                  id: callId,
                  caller: call.caller,
                  callerName: caller.name
                };

                console.log('📞 [Polling] Showing incoming call UI');
                UI.showIncomingCall(caller.name);
              }
            }
          }
        }
        lastCheckedTime = Date.now();
      } catch (error) {
        console.error('❌ Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  }
}

async function acceptCall() {
  if (!activeCall) return;

  // Update user status
  await db.ref(`users/${currentUser.uid}`).update({ status: 'in-call' });

  // Get call data
  const callData = await db.ref(`calls/${activeCall.id}`).once('value');
  const call = callData.val();

  // Create WebRTC answer
  await WebRTCManager.createAnswer(activeCall.id, call.offer);

  // Show active call screen
  UI.showActiveCall(activeCall.callerName);

  // Listen for call status
  listenForCallStatus(activeCall.id);
}

async function declineCall() {
  if (!activeCall) return;

  await db.ref(`calls/${activeCall.id}`).update({ status: 'declined' });
  activeCall = null;

  UI.showScreen(UI.mainScreen);
}

async function cancelCall() {
  if (!activeCall) return;

  await db.ref(`calls/${activeCall.id}`).update({ status: 'cancelled' });
  WebRTCManager.endCall();
  await db.ref(`users/${currentUser.uid}`).update({ status: 'online' });

  activeCall = null;
  UI.showScreen(UI.mainScreen);
}

async function endCall() {
  if (!activeCall) return;

  WebRTCManager.endCall();
  await db.ref(`users/${currentUser.uid}`).update({ status: 'online' });

  UI.stopCallTimer();
  activeCall = null;

  UI.showScreen(UI.mainScreen);
}

function listenForCallStatus(callId) {
  const callRef = db.ref(`calls/${callId}/status`);
  callRef.on('value', (snapshot) => {
    const status = snapshot.val();

    if (status === 'active' && activeCall) {
      const name = activeCall.calleeName || activeCall.callerName;
      UI.showActiveCall(name);
    }

    if (status === 'ended' || status === 'declined' || status === 'cancelled') {
      callRef.off();
      if (status === 'declined' || status === 'cancelled') {
        alert(status === 'declined' ? 'Звонок отклонен' : 'Звонок отменен');
      }
      endCall();
    }
  });
}

// === DEBUG PANEL ===

const DebugPanel = {
  isVisible: false,
  maxLogs: 100,

  init() {
    // Override console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      originalLog.apply(console, args);
      this.addLog('info', args.join(' '));
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      this.addLog('error', args.join(' '));
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      this.addLog('warn', args.join(' '));
    };
  },

  addLog(type, message) {
    if (!this.isVisible) return;

    const logsContainer = document.getElementById('debug-logs');
    const entry = document.createElement('div');
    entry.className = `debug-log-entry debug-log-${type}`;

    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;

    logsContainer.appendChild(entry);

    // Auto-scroll to bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // Limit number of logs
    while (logsContainer.children.length > this.maxLogs) {
      logsContainer.removeChild(logsContainer.firstChild);
    }
  },

  toggle() {
    this.isVisible = !this.isVisible;
    const panel = document.getElementById('debug-panel');
    panel.style.display = this.isVisible ? 'flex' : 'none';
  },

  clear() {
    document.getElementById('debug-logs').innerHTML = '';
  }
};

// === EVENT LISTENERS ===

function setupEventListeners() {
  // Debug panel
  DebugPanel.init();

  const debugToggleBtn = document.getElementById('debug-toggle-btn');
  if (debugToggleBtn) {
    debugToggleBtn.addEventListener('click', () => {
      DebugPanel.toggle();
    });
  }

  const debugCloseBtn = document.getElementById('debug-close-btn');
  if (debugCloseBtn) {
    debugCloseBtn.addEventListener('click', () => {
      DebugPanel.toggle();
    });
  }

  // Auth
  document.getElementById('google-signin-btn').addEventListener('click', signInWithGoogle);

  // Name setup
  document.getElementById('save-name-btn').addEventListener('click', () => {
    const name = document.getElementById('name-input').value.trim();
    if (!name) {
      alert('Введите имя');
      return;
    }
    saveUserName(name);
  });

  // Add contact
  document.getElementById('add-contact-btn').addEventListener('click', () => {
    UI.showModal(UI.addContactModal);
  });

  document.getElementById('cancel-add-btn').addEventListener('click', () => {
    UI.hideModal(UI.addContactModal);
  });

  document.getElementById('confirm-add-btn').addEventListener('click', () => {
    const email = document.getElementById('contact-email-input').value.trim();
    addContactByEmail(email);
  });

  // Share contact
  document.getElementById('share-contact-btn').addEventListener('click', () => {
    const link = generateShareLink();
    UI.showShareLink(link);
  });

  document.getElementById('copy-link-btn').addEventListener('click', () => {
    const linkInput = document.getElementById('share-link');
    linkInput.select();
    document.execCommand('copy');
    alert('Ссылка скопирована!');
  });

  document.getElementById('close-share-btn').addEventListener('click', () => {
    UI.hideModal(UI.shareModal);
  });

  // Call actions
  window.addEventListener('call-initiated', (e) => {
    initiateCall(e.detail.uid);
  });

  document.getElementById('accept-call-btn').addEventListener('click', acceptCall);
  document.getElementById('decline-call-btn').addEventListener('click', declineCall);
  document.getElementById('cancel-call-btn').addEventListener('click', cancelCall);
  document.getElementById('end-call-btn').addEventListener('click', endCall);

  // Speaker toggle
  document.getElementById('speaker-toggle-btn').addEventListener('click', () => {
    const isEnabled = WebRTCManager.toggleSpeaker();
    UI.updateSpeakerButton(isEnabled);
  });
}

// === SERVICE WORKER ===

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('Service Worker registered'))
      .catch(err => console.error('Service Worker registration failed:', err));
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (currentUser) {
    db.ref(`users/${currentUser.uid}`).update({
      status: 'offline',
      lastSeen: Date.now()
    });
  }
});
