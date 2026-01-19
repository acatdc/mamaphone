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
  // Check if user is returning from email link
  if (auth.isSignInWithEmailLink(window.location.href)) {
    handleEmailLinkSignIn();
    return;
  }

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

async function handleEmailLinkSignIn() {
  let email = window.localStorage.getItem('emailForSignIn');
  if (!email) {
    email = window.prompt('Пожалуйста, введите ваш email для подтверждения');
  }

  try {
    const result = await auth.signInWithEmailLink(email, window.location.href);
    window.localStorage.removeItem('emailForSignIn');
    window.history.replaceState({}, document.title, window.location.pathname);

    currentUser = result.user;
    checkUserProfile(result.user.uid);
  } catch (error) {
    console.error('Error signing in:', error);
    alert('Ошибка входа. Попробуйте еще раз.');
    UI.showScreen(UI.authScreen);
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
  const callsRef = db.ref('calls');
  callsRef.orderByChild('callee').equalTo(uid).on('child_added', async (snapshot) => {
    const call = snapshot.val();
    if (call.status === 'ringing') {
      const callerData = await db.ref(`users/${call.caller}`).once('value');
      const caller = callerData.val();

      activeCall = {
        id: snapshot.key,
        caller: call.caller,
        callerName: caller.name
      };

      UI.showIncomingCall(caller.name);
    }
  });
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

// === EVENT LISTENERS ===

function setupEventListeners() {
  // Auth
  document.getElementById('send-link-btn').addEventListener('click', async () => {
    const email = document.getElementById('email-input').value.trim();
    if (!email) {
      alert('Введите email');
      return;
    }

    try {
      await auth.sendSignInLinkToEmail(email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      document.getElementById('auth-form').classList.add('hidden');
      document.getElementById('auth-waiting').classList.remove('hidden');
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Ошибка отправки письма. Попробуйте еще раз.');
    }
  });

  document.getElementById('resend-btn').addEventListener('click', () => {
    document.getElementById('auth-form').classList.remove('hidden');
    document.getElementById('auth-waiting').classList.add('hidden');
  });

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
