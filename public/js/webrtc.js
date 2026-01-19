// WebRTC Manager
const WebRTCManager = {
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  currentCallId: null,
  isInitiator: false,
  iceServers: null,

  // Fetch ICE servers from Metered API
  async fetchIceServers() {
    try {
      const response = await fetch(
        `https://mamaphone.metered.live/api/v1/turn/credentials?apiKey=${meteredConfig.apiKey}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch TURN credentials');
      }

      this.iceServers = await response.json();
      console.log('✅ TURN credentials fetched successfully');
    } catch (error) {
      console.error('❌ Error fetching TURN credentials:', error);
      // Fallback to basic STUN servers
      this.iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' }
      ];
      console.warn('⚠️ Using fallback STUN servers only');
    }
  },

  // Initialize peer connection
  async initPeerConnection() {
    // Fetch fresh ICE servers if not already loaded
    if (!this.iceServers) {
      await this.fetchIceServers();
    }

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

    // ICE connection state monitoring
    this.peerConnection.oniceconnectionstatechange = async () => {
      console.log('ICE connection state:', this.peerConnection.iceConnectionState);

      if (this.peerConnection.iceConnectionState === 'connected' ||
          this.peerConnection.iceConnectionState === 'completed') {
        await this.logConnectionType();
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

  // Log connection type (P2P or TURN)
  async logConnectionType() {
    try {
      const stats = await this.peerConnection.getStats();
      let connectionType = 'unknown';
      let localCandidateType = '';
      let remoteCandidateType = '';

      stats.forEach(report => {
        // Find the active candidate pair
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          // Get local candidate
          const localCandidate = stats.get(report.localCandidateId);
          if (localCandidate) {
            localCandidateType = localCandidate.candidateType;
          }

          // Get remote candidate
          const remoteCandidate = stats.get(report.remoteCandidateId);
          if (remoteCandidate) {
            remoteCandidateType = remoteCandidate.candidateType;
          }

          // Determine connection type
          if (localCandidateType === 'relay' || remoteCandidateType === 'relay') {
            connectionType = 'TURN';
          } else if (localCandidateType === 'srflx' || remoteCandidateType === 'srflx') {
            connectionType = 'STUN';
          } else if (localCandidateType === 'host' && remoteCandidateType === 'host') {
            connectionType = 'P2P';
          }
        }
      });

      console.log('🔗 Connection established via:', connectionType);
      console.log('   Local candidate:', localCandidateType);
      console.log('   Remote candidate:', remoteCandidateType);

      // Update UI indicator
      this.updateConnectionIndicator(connectionType);
    } catch (error) {
      console.error('Error getting connection stats:', error);
    }
  },

  // Update connection type indicator in UI
  updateConnectionIndicator(type) {
    const indicator = document.getElementById('connection-indicator');
    if (!indicator) return;

    let icon = '⚪';
    let text = 'Unknown';

    if (type === 'P2P' || type === 'STUN') {
      icon = '🟢';
      text = 'P2P (direct)';
    } else if (type === 'TURN') {
      icon = '🟡';
      text = 'TURN (relay)';
    }

    indicator.innerHTML = `${icon} ${text}`;
    indicator.style.display = 'block';
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

    // Hide connection indicator
    const indicator = document.getElementById('connection-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }

    // Update call status in Firebase
    if (this.currentCallId) {
      db.ref(`calls/${this.currentCallId}`).update({ status: 'ended' });
      this.currentCallId = null;
    }

    this.isInitiator = false;
  }
};
