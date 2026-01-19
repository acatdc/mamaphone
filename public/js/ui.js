// UI Controller
const UI = {
  // Screens
  authScreen: document.getElementById('auth-screen'),
  nameScreen: document.getElementById('name-screen'),
  mainScreen: document.getElementById('main-screen'),
  incomingCallScreen: document.getElementById('incoming-call-screen'),
  outgoingCallScreen: document.getElementById('outgoing-call-screen'),
  activeCallScreen: document.getElementById('active-call-screen'),

  // Modals
  addContactModal: document.getElementById('add-contact-modal'),
  shareModal: document.getElementById('share-modal'),

  // Lists
  contactsList: document.getElementById('contacts-list'),
  emptyState: document.getElementById('empty-state'),

  // Show/hide screens
  showScreen(screen) {
    [this.authScreen, this.nameScreen, this.mainScreen,
     this.incomingCallScreen, this.outgoingCallScreen, this.activeCallScreen]
      .forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
  },

  showModal(modal) {
    modal.classList.remove('hidden');
  },

  hideModal(modal) {
    modal.classList.add('hidden');
  },

  // Render contacts list
  renderContacts(contacts) {
    this.contactsList.innerHTML = '';

    if (Object.keys(contacts).length === 0) {
      this.emptyState.classList.remove('hidden');
      return;
    }

    this.emptyState.classList.add('hidden');

    Object.entries(contacts).forEach(([uid, contact]) => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div class="contact-info">
          <div class="contact-avatar">👤</div>
          <div class="contact-details">
            <h3>${contact.displayName || contact.name}</h3>
            <span class="contact-status ${contact.status || 'offline'}">${this.getStatusText(contact.status)}</span>
          </div>
        </div>
        <div class="contact-actions">
          <button class="btn-success call-btn" data-uid="${uid}" ${contact.status === 'in-call' ? 'disabled' : ''}>
            📞 Позвонить
          </button>
        </div>
      `;
      this.contactsList.appendChild(item);
    });

    // Attach call button listeners
    document.querySelectorAll('.call-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.target.getAttribute('data-uid');
        window.dispatchEvent(new CustomEvent('call-initiated', { detail: { uid } }));
      });
    });
  },

  getStatusText(status) {
    switch(status) {
      case 'online': return '🟢 В сети';
      case 'in-call': return '📞 На звонке';
      default: return '⚪ Не в сети';
    }
  },

  // Call screens
  showIncomingCall(callerName) {
    document.getElementById('caller-name').textContent = callerName;
    this.showScreen(this.incomingCallScreen);
  },

  showOutgoingCall(calleeName) {
    document.getElementById('callee-name').textContent = `Звоним ${calleeName}...`;
    this.showScreen(this.outgoingCallScreen);
  },

  showActiveCall(name) {
    document.getElementById('active-call-name').textContent = name;
    this.showScreen(this.activeCallScreen);
    this.startCallTimer();
  },

  // Call timer
  callTimerInterval: null,
  callStartTime: null,

  startCallTimer() {
    this.callStartTime = Date.now();
    const timerEl = document.getElementById('call-timer');

    this.callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
  },

  stopCallTimer() {
    if (this.callTimerInterval) {
      clearInterval(this.callTimerInterval);
      this.callTimerInterval = null;
    }
  },

  // Speaker toggle
  updateSpeakerButton(isEnabled) {
    const btn = document.getElementById('speaker-toggle-btn');
    btn.textContent = isEnabled ? '🔊 Громкая связь' : '🔇 Громкая связь';
  },

  // Share link
  showShareLink(link) {
    document.getElementById('share-link').value = link;
    this.showModal(this.shareModal);
  },

  // Error messages
  showError(message, elementId = 'add-contact-error') {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 3000);
  }
};
