// services/ringtone.service.ts — Phát nhạc chuông trung tính lặp lại cho cuộc gọi đến
import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';

class RingtoneService {
  private player: AudioPlayer | null = null;
  private isPlaying = false;
  private webAudio: any = null;

  async start(): Promise<void> {
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      const globalRef: any = typeof globalThis !== 'undefined' ? globalThis : null;
      if (Platform.OS === 'web' && globalRef?.Audio) {
        try {
          if (!this.webAudio) {
            this.webAudio = new globalRef.Audio('/assets/sounds/ringtone.wav');
            this.webAudio.loop = true;
          }
          await this.webAudio.play();
          return;
        } catch {
          // If HTML5 Audio fails, try expo-audio
        }
      }

      await this.playExpoAudio();
    } catch (e) {
      console.warn('[RingtoneService] Could not start ringtone:', e);
    }
  }

  private async playExpoAudio(): Promise<void> {
    try {
      await setAudioModeAsync({
        playsInSilentMode: false,
        shouldPlayInBackground: false,
        interruptionMode: 'duckOthers',
      });

      if (this.player) {
        try {
          this.player.pause();
          this.player.remove();
        } catch {}
        this.player = null;
      }

      const player = createAudioPlayer(require('@/assets/sounds/ringtone.wav'));
      player.loop = true;
      player.volume = 1.0;
      this.player = player;

      if (this.isPlaying) {
        player.play();
      } else {
        player.pause();
        player.remove();
        this.player = null;
      }
    } catch (e) {
      console.warn('[RingtoneService] expo-audio playback error:', e);
    }
  }

  async stop(): Promise<void> {
    this.isPlaying = false;
    if (this.webAudio) {
      try {
        this.webAudio.pause();
        this.webAudio.currentTime = 0;
      } catch {}
    }
    if (this.player) {
      try {
        this.player.pause();
        this.player.remove();
      } catch {}
      this.player = null;
    }
  }
}

export const ringtoneService = new RingtoneService();
