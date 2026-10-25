// Native voice search: same hook API and messages as the web (which used the browser SpeechRecognition inside the
// Flutter WebView). Speech comes from @/lib/voice (expo-speech-recognition); interim text, the 2 s silence commit and
// the two automatic retries on "no speech" are kept.
import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { isVoiceSearchAvailable, startVoiceSearch, stopVoiceSearch } from '@/lib/voice';

const MAX_AUTO_RETRIES = 2;
// commit this long after the last word when the recognizer has not sent its final result yet (was 2 s: felt slow)
const SILENCE_COMMIT_MS = 1000;

const WEBVIEW_MIC_DENIED_MESSAGE =
    'Microphone access denied. Enable microphone for this app in phone settings, then try again.';

export const useVoiceSearch = (onResult, onError) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);

    const isStartingRef = useRef(false);
    const silenceTimeoutRef = useRef(null);
    const latestTranscriptRef = useRef('');
    const hasCommittedRef = useRef(false);
    const retryCountRef = useRef(0);
    const shouldKeepListeningRef = useRef(false);
    const sessionRef = useRef(0);
    const mountedRef = useRef(true);

    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;

    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const isListeningRef = useRef(false);
    isListeningRef.current = isListening;

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            if (shouldKeepListeningRef.current) {
                shouldKeepListeningRef.current = false;
                stopVoiceSearch();
            }
        };
    }, []);

    const clearSilenceTimeout = () => {
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }
    };

    const teardownRecognition = useCallback(() => {
        clearSilenceTimeout();
        sessionRef.current += 1;
        stopVoiceSearch();
    }, []);

    const stopListening = useCallback(() => {
        shouldKeepListeningRef.current = false;
        teardownRecognition();
        if (mountedRef.current) setIsListening(false);
        isStartingRef.current = false;
    }, [teardownRecognition]);

    const commitResult = useCallback(() => {
        if (hasCommittedRef.current) {
            return;
        }

        const finalResult = latestTranscriptRef.current.trim();
        if (!finalResult) {
            return;
        }

        hasCommittedRef.current = true;
        shouldKeepListeningRef.current = false;
        onResultRef.current?.(finalResult);
        stopListening();
    }, [stopListening]);

    const scheduleSilenceCommit = useCallback(() => {
        clearSilenceTimeout();
        silenceTimeoutRef.current = setTimeout(() => {
            if (latestTranscriptRef.current.trim()) {
                commitResult();
            }
        }, SILENCE_COMMIT_MS);
    }, [commitResult]);

    const failWith = useCallback((message, code) => {
        setError(message);
        toast.error(message, { duration: 3000 });
        onErrorRef.current?.(code);
        stopListening();
    }, [stopListening]);

    // One recognition run (the web created a new SpeechRecognition per run as well).
    const runRecognition = useCallback(() => {
        const session = ++sessionRef.current;
        const isCurrent = () => session === sessionRef.current && mountedRef.current;

        setIsListening(true);
        setError(null);
        isStartingRef.current = false;

        startVoiceSearch({
            lang: 'en-IN',
            onPartial: (text) => {
                if (!isCurrent()) return;
                const currentText = String(text || '').trim();
                if (!currentText) return;
                latestTranscriptRef.current = currentText;
                setTranscript(currentText);
                setError(null);
                scheduleSilenceCommit();
            },
        })
            .then((finalText) => {
                if (!isCurrent()) return;
                const currentText = String(finalText || '').trim();
                if (currentText) {
                    latestTranscriptRef.current = currentText;
                    setTranscript(currentText);
                    commitResult();
                    return;
                }

                // Recognition ended without a final result (the web's onend).
                if (hasCommittedRef.current || !shouldKeepListeningRef.current) {
                    setIsListening(false);
                    isStartingRef.current = false;
                    return;
                }

                if (latestTranscriptRef.current.trim()) {
                    commitResult();
                    return;
                }

                if (retryCountRef.current < MAX_AUTO_RETRIES) {
                    retryCountRef.current += 1;
                    isStartingRef.current = false;
                    setIsListening(false);
                    setTimeout(() => {
                        if (!shouldKeepListeningRef.current || hasCommittedRef.current || !mountedRef.current) {
                            return;
                        }
                        try {
                            isStartingRef.current = true;
                            runRecognition();
                        } catch (restartError) {
                            console.error('Speech recognition restart failed:', restartError);
                            setError('Could not keep listening. Please try again.');
                            stopListening();
                        }
                    }, 250);
                    return;
                }

                setError('No speech detected. Tap try again and speak clearly.');
                setIsListening(false);
                isStartingRef.current = false;
            })
            .catch((err) => {
                if (!isCurrent()) return;
                const code = String(err?.code || err?.message || '').toLowerCase();
                console.error('Speech recognition error:', code);

                if (code.includes('aborted')) {
                    return;
                }
                if (code.includes('permission') || code.includes('not-allowed') || code.includes('denied')) {
                    failWith(WEBVIEW_MIC_DENIED_MESSAGE, 'not-allowed');
                    return;
                }
                if (code.includes('network')) {
                    failWith('Network error during voice search.', 'network');
                    return;
                }
                setError('Could not keep listening. Please try again.');
                stopListening();
            });
        // runRecognition calls itself for the retries
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitResult, scheduleSilenceCommit, stopListening, failWith]);

    const startListening = useCallback(async () => {
        if (isListeningRef.current || isStartingRef.current) {
            return;
        }

        const available = await isVoiceSearchAvailable();
        if (!available) {
            const message = 'Voice search is not supported in this browser.';
            setError(message);
            toast.error(message);
            onErrorRef.current?.('unsupported');
            return;
        }

        try {
            isStartingRef.current = true;
            shouldKeepListeningRef.current = true;
            hasCommittedRef.current = false;
            retryCountRef.current = 0;
            latestTranscriptRef.current = '';
            setTranscript('');
            setError(null);

            teardownRecognition();
            runRecognition();
        } catch (startError) {
            isStartingRef.current = false;
            shouldKeepListeningRef.current = false;
            console.error('Speech recognition initialization failed:', startError);
            const message = 'Could not start voice search. Please try again.';
            setError(message);
            toast.error(message, { duration: 3000 });
        }
    }, [runRecognition, teardownRecognition]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        isListening,
        transcript,
        error,
        startListening,
        stopListening,
        clearError,
    };
};
