// services/ringtone.service.ts — Phát nhạc chuông trung tính lặp lại cho cuộc gọi đến
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

class RingtoneService {
  private sound: Audio.Sound | null = null;
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
          // If HTML5 Audio fails, try expo-av
        }
      }

      await this.playExpoAudio();
    } catch (e) {
      console.warn('[RingtoneService] Could not start ringtone:', e);
    }
  }

  private async playExpoAudio(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: false, // Tôn trọng chế độ im lặng trên iOS
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      if (this.sound) {
        await this.sound.unloadAsync().catch(() => {});
        this.sound = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/ringtone.wav'),
        { isLooping: true, volume: 1.0 },
      );
      this.sound = sound;
      if (this.isPlaying) {
        await sound.playAsync();
      } else {
        await sound.unloadAsync().catch(() => {});
        this.sound = null;
      }
    } catch (e) {
      console.warn('[RingtoneService] expo-av playback error:', e);
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
    if (this.sound) {
      try {
        await this.sound.stopAsync().catch(() => {});
        await this.sound.unloadAsync().catch(() => {});
      } catch {}
      this.sound = null;
    }
  }
}

export const ringtoneService = new RingtoneService();
