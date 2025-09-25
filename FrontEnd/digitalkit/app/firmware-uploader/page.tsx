'use client';

import { useEffect, useRef, useState } from 'react';

export default function UnoFirmwareUploader() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Listen for global errors and promise rejections
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      setError('Unhandled promise rejection: ' + (event.reason?.message || event.reason || 'Unknown error'));
    };
    const handleError = (event: ErrorEvent) => {
      setError('Global error: ' + (event.message || 'Unknown error'));
    };
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Load the uploader script from local public directory
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://github.com/dbuezas/arduino-web-uploader/releases/download/v1.0.0/main.js';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setError('Failed to load uploader script.');
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Create the button in the DOM after script is loaded
  useEffect(() => {
    if (!scriptLoaded) return;
    if (!containerRef.current) return;

    // Remove any previous button
    containerRef.current.innerHTML = '';

    // Create the button
    const btn = document.createElement('button');
    btn.setAttribute('arduino-uploader', '');
    btn.setAttribute('hex-href', '/releases/arduino_uno_v1_0_0.hex');
    btn.setAttribute('board', 'uno');
    btn.style.padding = '8px 24px';
    btn.style.fontSize = '16px';
    btn.style.marginTop = '24px';
    btn.style.color = '#0f0';
    btn.style.background = '#222';
    btn.style.border = '1px solid #0f0';
    btn.style.borderRadius = '4px';
    btn.innerHTML = 'Upload Firmware to Arduino Uno <span class="upload-progress" style="margin-left:12px;"></span>';

    // Add debugging
    btn.addEventListener('click', () => {
      setError(null); // Clear previous error
      setTimeout(() => {
        // If nothing happens after 2s, show error
        const progress = btn.querySelector('.upload-progress');
        if (progress && !progress.textContent?.trim()) {
          setError('Uploader did not start. Make sure you are using Chrome/Edge/Opera on desktop, and your Arduino Uno is connected. If the problem persists, try reloading the page.');
        }
      }, 2000);
    });

    // Observe the upload-progress span for error messages
    const progressSpan = btn.querySelector('.upload-progress');
    let observer: MutationObserver | null = null;
    if (progressSpan) {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            const text = progressSpan.textContent?.trim();
            if (text && /error|fail|not found|denied|unsupported|disconnect|abort/i.test(text)) {
              setError('Uploader error: ' + text);
            }
          }
        }
      });
      observer.observe(progressSpan, { childList: true, characterData: true, subtree: true });
    }

    containerRef.current.appendChild(btn);
    return () => {
      if (observer) observer.disconnect();
    };
  }, [scriptLoaded]);

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <h2 style={{ color: '#0f0' }}>Arduino Uno Firmware Uploader</h2>
      <div style={{ color: '#f00', fontWeight: 600 }}>
        Warning: Uploading custom firmware will disable the default Arduino bootloader, hardware button, and onboard LED functionality until you re-upload the original firmware via the Arduino IDE.
      </div>
      <p style={{ color: '#0f0' }}>
        Select a firmware version to upload to your Arduino Uno using Web Serial.<br />
        <b>Supported browsers:</b> Chrome, Edge, Opera (desktop only)
      </p>
      <div ref={containerRef} />
      {error && (
        <div style={{ color: '#f00', marginTop: 16 }}>
          <b>Error:</b> {error}
        </div>
      )}
      <div style={{ marginTop: 32, fontSize: 12, color: '#888' }}>
        <p>
          <b>Note:</b> You will lose access to the hardware button and onboard LED after uploading custom firmware.
        </p>
      </div>
    </div>
  );
} 