// WebRTC Manager
const WebRTCManager = {
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  currentCallId: null,
  isInitiator: false,

  // ICE servers configuration
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],

  // Initialize peer connection
  async initPeerConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        const remoteAudio = document.getElementById('remote-audio');
        remoteAudio.srcObject = this.remoteStream;
      }
      this.remoteStream.addTrack(event.track);
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.currentCallId) {
        const candidatePath = this.isInitiator ? 'iceCandidatesCaller' : 'iceCandidatesCallee';
        db.ref(`calls/${this.currentCallId}/${candidatePath}`).push(event.candidate.toJSON());
      }
    };

    // Connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'disconnected' ||
          this.peerConnection.connectionState === 'failed') {
        this.endCall();
      }
    };
  },

  // Get user media (microphone)
  async getUserMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      return true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
      return false;
    }
  },

  // Create offer (caller)
  async createOffer(callId) {
    this.currentCallId = callId;
    this.isInitiator = true;

    const hasMedia = await this.getUserMedia();
    if (!hasMedia) return;

    await this.initPeerConnection();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Save offer to Firebase
    await db.ref(`calls/${callId}`).update({
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    });

    // Listen for answer
    this.listenForAnswer(callId);
    this.listenForIceCandidates(callId, 'iceCandidatesCallee');
  },

  // Create answer (callee)
  async createAnswer(callId, offer) {
    this.currentCallId = callId;
    this.isInitiator = false;

    const hasMedia = await this.getUserMedia();
    if (!hasMedia) return;

    await this.initPeerConnection();

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // Save answer to Firebase
    await db.ref(`calls/${callId}`).update({
      answer: {
        type: answer.type,
        sdp: answer.sdp
      },
      status: 'active'
    });

    this.listenForIceCandidates(callId, 'iceCandidatesCaller');
  },

  // Listen for answer
  listenForAnswer(callId) {
    const answerRef = db.ref(`calls/${callId}/answer`);
    answerRef.on('value', async (snapshot) => {
      const answer = snapshot.val();
      if (answer && this.peerConnection.signalingState !== 'stable') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

        // Update call status to active
        await db.ref(`calls/${callId}`).update({ status: 'active' });
      }
    });
  },

  // Listen for ICE candidates
  listenForIceCandidates(callId, path) {
    const candidatesRef = db.ref(`calls/${callId}/${path}`);
    candidatesRef.on('child_added', async (snapshot) => {
      const candidate = snapshot.val();
      if (candidate && this.peerConnection) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    });
  },

  // Toggle speaker
  toggleSpeaker() {
    const remoteAudio = document.getElementById('remote-audio');
    if (!remoteAudio) return false;

    // Toggle between earpiece and speaker
    // Note: This is a simplified version, actual implementation may vary
    const currentVolume = remoteAudio.volume;
    remoteAudio.volume = currentVolume === 1 ? 0.5 : 1;

    return remoteAudio.volume === 1;
  },

  // End call and cleanup
  endCall() {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clear remote stream
    const remoteAudio = document.getElementById('remote-audio');
    if (remoteAudio) {
      remoteAudio.srcObject = null;
    }
    this.remoteStream = null;

    // Update call status in Firebase
    if (this.currentCallId) {
      db.ref(`calls/${this.currentCallId}`).update({ status: 'ended' });
      this.currentCallId = null;
    }

    this.isInitiator = false;
  }
};
