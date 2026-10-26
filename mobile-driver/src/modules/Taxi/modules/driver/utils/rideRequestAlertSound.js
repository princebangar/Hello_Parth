// Web: utils/rideRequestAlertSound.js — the incoming-ride alert: the ride-request-alert.mp3 on a loop, a vibration
// pattern ([400, 180, 400] every ~2 s) and a ping to the native shell ('driverOrderAlert') while a request waits.
// The web needed an "unlock" tap before audio could play and fell back to a WebAudio beep; the app plays the file
// directly (expo-audio), also while the app is in the background or the screen is off (audio mode
// shouldPlayInBackground; the "You are online" location service keeps the app process alive), and loops the vibration
// with the native Vibration API. Same three exports as the web.
import { Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import rideRequestAlertUrl from '../../../assets/sounds/ride-request-alert.mp3';

const VIBRATION_PATTERN = [0, 400, 180, 400, 1000];

let player = null;
let shouldKeepPlaying = false;
let audioModeSet = false;

const ensureAudioMode = () => {
    if (audioModeSet) return;
    audioModeSet = true;
    setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'duckOthers',
    }).catch(() => {
        audioModeSet = false;
    });
};

const getPlayer = () => {
    if (!player) {
        try {
            player = createAudioPlayer(rideRequestAlertUrl);
            player.loop = true;
            player.volume = 1;
        } catch {
            player = null;
        }
    }
    return player;
};

/** Web: unlocked audio on the first tap. Here it prepares the player so the first alert starts without a delay. */
export const unlockRideRequestAlertSound = () => {
    ensureAudioMode();
    getPlayer();
    return Promise.resolve();
};

export const playRideRequestAlertSound = () => {
    ensureAudioMode();
    const audio = getPlayer();
    const alreadyPlaying = shouldKeepPlaying;
    shouldKeepPlaying = true;
    if (!alreadyPlaying) {
        // repeat: true loops the pattern until cancel()
        Vibration.vibrate(VIBRATION_PATTERN, true);
    }
    if (!audio) return;
    try {
        audio.seekTo(0).catch(() => {});
        audio.play();
    } catch {
        // the vibration still tells the driver
    }
};

export const stopRideRequestAlertSound = () => {
    shouldKeepPlaying = false;
    Vibration.cancel();
    if (!player) return;
    try {
        player.pause();
        player.seekTo(0).catch(() => {});
    } catch {
        // ignore
    }
};
