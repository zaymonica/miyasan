/**
 * Camera Module - DISABLED FOR FUTURE RELEASE
 * 
 * This module is temporarily disabled and will be implemented in a future update.
 * All functionality has been commented out to allow for immediate launch.
 * 
 * TODO for future release:
 * - Fix photo capture functionality
 * - Improve camera initialization
 * - Add better error handling
 * - Test across different browsers and devices
 */

/*
// CAMERA MODULE CODE - COMMENTED OUT FOR FUTURE RELEASE

(function() {
    'use strict';

    let cameraStream = null;
    let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
    let capturedBlob = null;

    function debugCameraState() {
        const preview = document.getElementById('cameraPreview');
        const capturedImage = document.getElementById('capturedImage');
        const canvas = document.getElementById('cameraCanvas');
        
        console.log('[Camera Debug] State:', {
            hasStream: !!cameraStream,
            previewDimensions: preview ? `${preview.videoWidth}x${preview.videoHeight}` : 'N/A',
            previewVisible: preview ? preview.style.display !== 'none' : false,
            imageVisible: capturedImage ? capturedImage.style.display !== 'none' : false,
            canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'N/A',
            facingMode: currentFacingMode,
            capturedBlob: !!capturedBlob
        });
    }

    async function openCamera() {
        const modal = document.getElementById('cameraModal');
        if (!modal) return;

        modal.style.display = 'flex';
        const success = await startCamera();
        if (success) {
            debugCameraState();
            
            const captureBtn = document.getElementById('captureBtn');
            if (captureBtn) {
                captureBtn.removeEventListener('click', capturePhoto);
                captureBtn.addEventListener('click', function(e) {
                    console.log('[Camera] Capture button clicked via event listener');
                    e.preventDefault();
                    e.stopPropagation();
                    capturePhoto();
                });
                console.log('[Camera] Added click event listener to capture button');
            }
        }
    }

    function closeCamera() {
        const modal = document.getElementById('cameraModal');
        if (modal) {
            modal.style.display = 'none';
        }
        stopCamera();
        resetCameraUI();
    }

    async function startCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: currentFacingMode,
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 }
                },
                audio: false
            };

            console.log('[Camera] Requesting camera access with constraints:', constraints);
            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            const preview = document.getElementById('cameraPreview');
            if (preview) {
                preview.srcObject = cameraStream;
                preview.classList.toggle('back-camera', currentFacingMode === 'environment');
                
                return new Promise((resolve, reject) => {
                    let resolved = false;
                    
                    const checkVideoReady = () => {
                        if (resolved) return;
                        
                        console.log('[Camera] Checking video readiness:', {
                            videoWidth: preview.videoWidth,
                            videoHeight: preview.videoHeight,
                            readyState: preview.readyState,
                            paused: preview.paused
                        });
                        
                        if (preview.videoWidth > 0 && preview.videoHeight > 0) {
                            resolved = true;
                            console.log('[Camera] Video is ready:', preview.videoWidth, 'x', preview.videoHeight);
                            resolve(true);
                        }
                    };
                    
                    preview.onloadedmetadata = () => {
                        console.log('[Camera] Metadata loaded');
                        checkVideoReady();
                    };
                    
                    preview.onloadeddata = () => {
                        console.log('[Camera] Data loaded');
                        checkVideoReady();
                    };
                    
                    preview.oncanplay = () => {
                        console.log('[Camera] Can play');
                        checkVideoReady();
                    };
                    
                    preview.onplaying = () => {
                        console.log('[Camera] Playing');
                        checkVideoReady();
                    };
                    
                    preview.onerror = (error) => {
                        console.error('[Camera] Video element error:', error);
                        if (!resolved) {
                            resolved = true;
                            reject(error);
                        }
                    };
                    
                    preview.play().then(() => {
                        console.log('[Camera] Play() succeeded');
                        setTimeout(checkVideoReady, 100);
                    }).catch(err => {
                        console.error('[Camera] Play() failed:', err);
                        setTimeout(checkVideoReady, 100);
                    });
                    
                    setTimeout(() => {
                        if (!resolved) {
                            console.warn('[Camera] Timeout waiting for video, checking one more time...');
                            checkVideoReady();
                            
                            setTimeout(() => {
                                if (!resolved) {
                                    resolved = true;
                                    reject(new Error('Video failed to load within timeout'));
                                }
                            }, 2000);
                        }
                    }, 3000);
                });
            }

            console.log('[Camera] Stream started');
            return true;
        } catch (error) {
            console.error('[Camera] Error starting camera:', error);
            if (typeof showNotification === 'function') {
                showNotification('Could not access camera: ' + error.message, 'error');
            }
            closeCamera();
            return false;
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => {
                track.stop();
                console.log('[Camera] Stopped track:', track.kind);
            });
            cameraStream = null;
        }
    }

    async function switchCamera() {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        console.log('[Camera] Switching to:', currentFacingMode);
        stopCamera();
        await startCamera();
    }

    function capturePhoto() {
        console.log('[Camera] capturePhoto() called');
        
        const preview = document.getElementById('cameraPreview');
        const canvas = document.getElementById('cameraCanvas');
        const capturedImage = document.getElementById('capturedImage');
        
        if (!preview || !canvas || !capturedImage) {
            console.error('[Camera] Missing elements for photo capture:', {
                preview: !!preview,
                canvas: !!canvas,
                capturedImage: !!capturedImage
            });
            return;
        }

        console.log('[Camera] Current state before capture:', {
            videoWidth: preview.videoWidth,
            videoHeight: preview.videoHeight,
            readyState: preview.readyState,
            paused: preview.paused,
            srcObject: !!preview.srcObject,
            hasStream: !!cameraStream
        });

        if (preview.videoWidth === 0 || preview.videoHeight === 0) {
            console.error('[Camera] Video not ready for capture, dimensions:', preview.videoWidth, 'x', preview.videoHeight);
            
            if (typeof showNotification === 'function') {
                showNotification('Camera not ready, trying again...', 'warning');
            }
            
            setTimeout(() => {
                console.log('[Camera] Retrying capture after delay...');
                capturePhoto();
            }, 1000);
            return;
        }

        console.log('[Camera] Capturing photo from video:', preview.videoWidth, 'x', preview.videoHeight);

        canvas.width = preview.videoWidth;
        canvas.height = preview.videoHeight;

        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            console.error('[Camera] Could not get canvas context');
            if (typeof showNotification === 'function') {
                showNotification('Canvas error', 'error');
            }
            return;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        
        if (currentFacingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        
        try {
            ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
            console.log('[Camera] Image drawn to canvas successfully');
        } catch (error) {
            console.error('[Camera] Error drawing to canvas:', error);
            ctx.restore();
            if (typeof showNotification === 'function') {
                showNotification('Failed to capture photo: ' + error.message, 'error');
            }
            return;
        }
        
        ctx.restore();

        try {
            canvas.toBlob((blob) => {
                if (!blob) {
                    console.error('[Camera] Failed to create image blob');
                    if (typeof showNotification === 'function') {
                        showNotification('Failed to create image', 'error');
                    }
                    return;
                }

                capturedBlob = blob;
                
                const imageUrl = URL.createObjectURL(blob);
                
                console.log('[Camera] Image blob created, size:', blob.size, 'bytes');
                
                capturedImage.onload = function() {
                    preview.style.display = 'none';
                    capturedImage.style.display = 'block';
                    showCaptureActions();
                    console.log('[Camera] Photo captured and displayed successfully');
                };
                
                capturedImage.onerror = function(error) {
                    console.error('[Camera] Failed to load captured image:', error);
                    if (typeof showNotification === 'function') {
                        showNotification('Failed to display captured photo', 'error');
                    }
                    preview.style.display = 'block';
                    capturedImage.style.display = 'none';
                    URL.revokeObjectURL(imageUrl);
                };
                
                capturedImage.src = imageUrl;
                
            }, 'image/jpeg', 0.95);
        } catch (error) {
            console.error('[Camera] Error converting canvas to blob:', error);
            if (typeof showNotification === 'function') {
                showNotification('Failed to process image: ' + error.message, 'error');
            }
        }
    }

    function showCaptureActions() {
        const controls = document.querySelector('.camera-controls');
        const actions = document.getElementById('cameraActions');
        
        if (controls) controls.style.display = 'none';
        if (actions) actions.style.display = 'flex';
    }

    function hideCaptureActions() {
        const controls = document.querySelector('.camera-controls');
        const actions = document.getElementById('cameraActions');
        
        if (controls) controls.style.display = 'flex';
        if (actions) actions.style.display = 'none';
    }

    async function retakePhoto() {
        capturedBlob = null;

        const preview = document.getElementById('cameraPreview');
        const capturedImage = document.getElementById('capturedImage');

        if (capturedImage && capturedImage.src) {
            URL.revokeObjectURL(capturedImage.src);
            capturedImage.src = '';
            capturedImage.style.display = 'none';
        }

        if (preview) {
            preview.style.display = 'block';
        }

        hideCaptureActions();
        
        if (!cameraStream) {
            await startCamera();
        }
        
        console.log('[Camera] Photo retaken, camera restarted');
    }

    async function sendCapturedPhoto() {
        if (!capturedBlob) {
            console.error('[Camera] No photo to send');
            return;
        }

        console.log('[Camera] Sending captured photo, size:', capturedBlob.size);
        closeCamera();

        if (typeof uploadAndSendMedia === 'function') {
            await uploadAndSendMedia(capturedBlob, 'image');
        } else {
            console.error('[Camera] uploadAndSendMedia function not found');
        }

        capturedBlob = null;
    }

    function resetCameraUI() {
        capturedBlob = null;

        const preview = document.getElementById('cameraPreview');
        const capturedImage = document.getElementById('capturedImage');

        if (preview) {
            preview.style.display = 'block';
            preview.srcObject = null;
        }
        
        if (capturedImage) {
            if (capturedImage.src) {
                URL.revokeObjectURL(capturedImage.src);
            }
            capturedImage.style.display = 'none';
            capturedImage.src = '';
        }

        hideCaptureActions();
        
        console.log('[Camera] UI reset completed');
    }

    // Expose to window
    window.Camera = {
        open: openCamera,
        close: closeCamera,
        switch: switchCamera,
        capture: capturePhoto,
        retake: retakePhoto,
        send: sendCapturedPhoto,
        debug: debugCameraState,
        test: () => {
            console.log('[Camera] Test function called');
            debugCameraState();
            const preview = document.getElementById('cameraPreview');
            if (preview) {
                console.log('[Camera] Preview element found:', {
                    videoWidth: preview.videoWidth,
                    videoHeight: preview.videoHeight,
                    readyState: preview.readyState,
                    paused: preview.paused
                });
            }
        }
    };

    // Global functions for HTML onclick handlers
    window.openCameraModal = openCamera;
    window.closeCameraModal = closeCamera;
    window.switchCamera = switchCamera;
    window.captureMedia = function() {
        console.log('[Camera] captureMedia() called from HTML');
        capturePhoto();
    };
    window.retakeMedia = retakePhoto;
    window.sendCapturedMedia = sendCapturedPhoto;
})();

// END OF COMMENTED CAMERA CODE
*/

// Placeholder functions to prevent errors if camera functions are called
window.openCameraModal = function() {
    console.log('[Camera] Camera functionality disabled for this release');
    if (typeof showNotification === 'function') {
        showNotification('Camera feature will be available in a future update', 'info');
    }
};

window.closeCameraModal = function() {};
window.switchCamera = function() {};
window.captureMedia = function() {};
window.retakeMedia = function() {};
window.sendCapturedMedia = function() {};

// Empty Camera object to prevent errors
window.Camera = {
    open: window.openCameraModal,
    close: window.closeCameraModal,
    switch: window.switchCamera,
    capture: window.captureMedia,
    retake: window.retakeMedia,
    send: window.sendCapturedMedia,
    debug: function() { console.log('[Camera] Camera functionality disabled'); },
    test: function() { console.log('[Camera] Camera functionality disabled'); }
};
