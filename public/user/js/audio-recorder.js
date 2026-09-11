/**
 * Audio Recorder Module
 * Handles audio recording with spectrum visualization
 */

(function() {
    'use strict';

    let mediaRecorder = null;
    let audioChunks = [];
    let audioContext = null;
    let analyser = null;
    let dataArray = null;
    let animationId = null;
    let recordingStartTime = null;
    let timerInterval = null;
    let audioStream = null;

    /**
     * Start audio recording
     */
    async function startRecording() {
        try {
            console.log('[AudioRecorder] Starting recording...');
            
            // Check if browser supports getUserMedia
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.error('[AudioRecorder] getUserMedia not supported');
                if (typeof showNotification === 'function') {
                    showNotification('Your browser does not support audio recording', 'error');
                }
                return false;
            }
            
            // Request microphone access
            console.log('[AudioRecorder] Requesting microphone access...');
            audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            console.log('[AudioRecorder] Microphone access granted');

            // Setup audio context for visualization
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Resume audio context if suspended (required by some browsers)
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            
            const source = audioContext.createMediaStreamSource(audioStream);
            source.connect(analyser);
            
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            // Setup media recorder - try different mime types
            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                mimeType = 'audio/ogg;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
            }
            
            console.log('[AudioRecorder] Using mime type:', mimeType);
            
            mediaRecorder = new MediaRecorder(audioStream, { mimeType });
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                console.log('[AudioRecorder] Data available, size:', event.data.size);
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                console.log('[AudioRecorder] Recording stopped, chunks:', audioChunks.length);
            };
            
            mediaRecorder.onerror = (event) => {
                console.error('[AudioRecorder] MediaRecorder error:', event.error);
            };

            // Start recording
            mediaRecorder.start(100);
            recordingStartTime = Date.now();
            
            console.log('[AudioRecorder] MediaRecorder state:', mediaRecorder.state);

            // Show recording interface
            showRecordingInterface();

            // Start visualization
            drawSpectrum();

            // Start timer
            startTimer();

            console.log('[AudioRecorder] Recording started successfully');
            return true;
        } catch (error) {
            console.error('[AudioRecorder] Error starting recording:', error);
            cleanup();
            if (typeof showNotification === 'function') {
                let errorMsg = 'Could not access microphone';
                if (error.name === 'NotAllowedError') {
                    errorMsg = 'Microphone permission denied. Please allow microphone access.';
                } else if (error.name === 'NotFoundError') {
                    errorMsg = 'No microphone found. Please connect a microphone.';
                }
                showNotification(errorMsg, 'error');
            }
            return false;
        }
    }

    /**
     * Stop recording and return audio blob
     */
    function stopRecording() {
        return new Promise((resolve) => {
            if (!mediaRecorder || mediaRecorder.state === 'inactive') {
                resolve(null);
                return;
            }

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                cleanup();
                resolve(audioBlob);
            };

            mediaRecorder.stop();
        });
    }

    /**
     * Cancel recording
     */
    function cancelRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        cleanup();
        hideRecordingInterface();
    }

    /**
     * Cleanup resources
     */
    function cleanup() {
        // Stop animation
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        // Stop timer
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        // Close audio context
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        // Stop audio stream
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }

        mediaRecorder = null;
        audioChunks = [];
        analyser = null;
        dataArray = null;
    }

    /**
     * Show recording interface
     */
    function showRecordingInterface() {
        const inputArea = document.getElementById('messageInputArea');
        const recordingInterface = document.getElementById('audioRecordingInterface');
        
        if (inputArea) inputArea.style.display = 'none';
        if (recordingInterface) recordingInterface.style.display = 'block';
    }

    /**
     * Hide recording interface
     */
    function hideRecordingInterface() {
        const inputArea = document.getElementById('messageInputArea');
        const recordingInterface = document.getElementById('audioRecordingInterface');
        
        if (inputArea) inputArea.style.display = 'flex';
        if (recordingInterface) recordingInterface.style.display = 'none';
        
        // Reset timer display
        const timerEl = document.getElementById('recordingTimer');
        if (timerEl) timerEl.textContent = '00:00';
    }

    /**
     * Start timer
     */
    function startTimer() {
        const timerEl = document.getElementById('recordingTimer');
        if (!timerEl) return;

        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    /**
     * Draw audio spectrum
     */
    function drawSpectrum() {
        const canvas = document.getElementById('audioSpectrum');
        if (!canvas || !analyser) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const barCount = 30;
        const barWidth = (width / barCount) - 2;

        function draw() {
            animationId = requestAnimationFrame(draw);

            analyser.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, width, height);

            // Draw bars
            for (let i = 0; i < barCount; i++) {
                const dataIndex = Math.floor(i * (dataArray.length / barCount));
                const value = dataArray[dataIndex];
                const barHeight = (value / 255) * height * 0.9;
                const x = i * (barWidth + 2);
                const y = (height - barHeight) / 2;

                // Gradient color based on intensity
                const hue = 120 - (value / 255) * 60; // Green to yellow
                ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
                
                ctx.beginPath();
                ctx.roundRect(x, y, barWidth, barHeight, 2);
                ctx.fill();
            }
        }

        draw();
    }

    /**
     * Check if recording is active
     */
    function isRecording() {
        return mediaRecorder && mediaRecorder.state === 'recording';
    }

    // Expose to window
    window.AudioRecorder = {
        start: startRecording,
        stop: stopRecording,
        cancel: cancelRecording,
        isRecording: isRecording,
        hideInterface: hideRecordingInterface
    };
})();
