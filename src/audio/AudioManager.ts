import * as THREE from "three";
import { SOUNDS, type SoundGroup } from "../config/assets";
import type { ProgressFn } from "../core/loading";
import { isMinigame } from "../platform/env";

type InnerAudio = {
  src: string;
  loop: boolean;
  volume: number;
  play: () => void;
  stop: () => void;
  destroy: () => void;
  onEnded?: (fn: () => void) => void;
};

/**
 * 音效。
 *
 * Web：THREE.Audio + AudioContext。
 * 小游戏：优先 wx.createWebAudioContext 驱动 THREE.Audio；
 * 背景音乐改用 InnerAudioContext。整段初始化包 try/catch，失败不挡游戏。
 */
export class AudioManager {
  private listener: THREE.AudioListener | null = null;
  private readonly buffers = new Map<SoundGroup, AudioBuffer[]>();
  private readonly lastIndex = new Map<SoundGroup, number>();
  private background: THREE.Audio | null = null;
  private backgroundInner: InnerAudio | null = null;
  private unlocked = false;
  private disabled = false;
  private readonly bgUrl: string | null;

  readonly ready: Promise<void>;

  constructor(camera: THREE.Camera, onProgress?: ProgressFn) {
    this.bgUrl = SOUNDS.bg[0] ?? null;
    try {
      this.listener = new THREE.AudioListener();
      camera.add(this.listener);
      this.ready = this.loadAll(onProgress);
    } catch (err) {
      console.warn("音频初始化失败，本局静音:", err);
      this.disabled = true;
      this.listener = null;
      // 进度条仍要走完音效份额，避免卡在 loading
      this.ready = this.skipProgress(onProgress);
    }

    window.addEventListener("pointerdown", this.unlock, { once: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.unlocked) this.resume();
    });
  }

  private async skipProgress(onProgress?: ProgressFn) {
    const total = Object.values(SOUNDS).reduce((n, list) => n + list.length, 0);
    for (let i = 0; i < total; i++) onProgress?.();
  }

  private async loadAll(onProgress?: ProgressFn) {
    if (!this.listener) return;
    const loader = new THREE.AudioLoader();

    const groups = Object.entries(SOUNDS) as Array<[SoundGroup, readonly string[]]>;
    await Promise.all(
      groups.map(async ([group, urls]) => {
        // 小游戏 BGM 走 InnerAudio，不必解码进 AudioBuffer
        if (isMinigame() && group === "bg") {
          urls.forEach(() => onProgress?.());
          this.buffers.set(group, []);
          return;
        }
        const loaded = await Promise.all(
          urls.map((url) =>
            loader
              .loadAsync(url)
              .catch((err) => {
                console.warn(`音效加载失败,跳过 ${url}:`, err);
                return null;
              })
              .finally(() => onProgress?.()),
          ),
        );
        this.buffers.set(group, loaded.filter((b): b is AudioBuffer => b !== null));
      }),
    );
  }

  private unlock = () => {
    this.unlocked = true;
    this.resume();
    this.playBackground();
  };

  private resume() {
    const ctx = this.listener?.context;
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  private pick(group: SoundGroup): AudioBuffer | null {
    const list = this.buffers.get(group);
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];

    const last = this.lastIndex.get(group) ?? -1;
    let i = Math.floor(Math.random() * list.length);
    if (i === last) i = (i + 1) % list.length;
    this.lastIndex.set(group, i);
    return list[i];
  }

  private pickUrl(group: SoundGroup): string | null {
    const list = SOUNDS[group];
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];
    const last = this.lastIndex.get(group) ?? -1;
    let i = Math.floor(Math.random() * list.length);
    if (i === last) i = (i + 1) % list.length;
    this.lastIndex.set(group, i);
    return list[i];
  }

  private playInner(url: string, volume: number, loop = false) {
    const factory = (globalThis as { __wxCreateInnerAudio?: () => InnerAudio | null })
      .__wxCreateInnerAudio;
    const inner = factory?.() ?? null;
    if (!inner) return null;
    try {
      inner.src = url;
      inner.loop = loop;
      inner.volume = volume;
      inner.play();
      return inner;
    } catch (err) {
      console.warn("InnerAudio 播放失败:", err);
      try {
        inner.destroy();
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  play(group: SoundGroup, volume = 1, detune = true) {
    if (!this.unlocked || this.disabled) return;

    if (this.listener) {
      const buffer = this.pick(group);
      if (buffer) {
        try {
          const sound = new THREE.Audio(this.listener);
          sound.setBuffer(buffer);
          sound.setVolume(volume);
          if (detune) sound.setPlaybackRate(0.92 + Math.random() * 0.16);
          sound.onEnded = () => sound.disconnect();
          sound.play();
          return;
        } catch (err) {
          console.warn("WebAudio 播放失败,尝试 InnerAudio:", err);
        }
      }
    }

    const url = this.pickUrl(group);
    if (url) this.playInner(url, volume, false);
  }

  playBackground(volume = 0.25) {
    if (this.background || this.backgroundInner) return;

    if (isMinigame() && this.bgUrl) {
      this.backgroundInner = this.playInner(this.bgUrl, volume, true);
      return;
    }

    if (!this.listener) return;
    const buffer = this.pick("bg");
    if (!buffer) return;
    try {
      this.background = new THREE.Audio(this.listener);
      this.background.setBuffer(buffer);
      this.background.setLoop(true);
      this.background.setVolume(volume);
      this.background.play();
    } catch (err) {
      console.warn("背景音乐播放失败:", err);
      this.background = null;
    }
  }

  dispose() {
    try {
      this.background?.stop();
    } catch {
      /* ignore */
    }
    this.background = null;
    try {
      this.backgroundInner?.stop();
      this.backgroundInner?.destroy();
    } catch {
      /* ignore */
    }
    this.backgroundInner = null;
    this.listener?.parent?.remove(this.listener);
  }
}
