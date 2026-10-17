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
  pause?: () => void;
  destroy: () => void;
  onEnded?: (fn: () => void) => void;
  onError?: (fn: (err?: unknown) => void) => void;
  offEnded?: (fn?: () => void) => void;
  offError?: (fn?: () => void) => void;
};

const managers = new Set<AudioManager>();

/**
 * 音效。
 *
 * Web：THREE.Audio + AudioContext。
 * 小游戏：WebAudio（若可用）+ InnerAudio 对象池播 SFX；BGM 用独立 InnerAudio。
 * 初始化失败不挡游戏。
 */
export class AudioManager {
  private listener: THREE.AudioListener | null = null;
  private readonly buffers = new Map<SoundGroup, AudioBuffer[]>();
  private readonly lastIndex = new Map<SoundGroup, number>();
  private background: THREE.Audio | null = null;
  private backgroundInner: InnerAudio | null = null;
  private bgVolume = 0.25;
  private unlocked = false;
  private disabled = false;
  private readonly bgUrl: string | null;

  readonly ready: Promise<void>;

  constructor(camera: THREE.Camera, onProgress?: ProgressFn) {
    this.bgUrl = SOUNDS.bg[0] ?? null;
    managers.add(this);
    try {
      this.listener = new THREE.AudioListener();
      camera.add(this.listener);
      this.ready = this.loadAll(onProgress);
    } catch (err) {
      console.warn("音频初始化失败，本局静音:", err);
      this.disabled = true;
      this.listener = null;
      this.ready = this.skipProgress(onProgress);
    }

    window.addEventListener("pointerdown", this.unlock, { once: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.unlocked) this.resumeFromBackground();
      if (document.visibilityState === "hidden") this.suspend();
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
        if (isMinigame() && group === "bg") {
          urls.forEach(() => onProgress?.());
          this.buffers.set(group, []);
          return;
        }
        // 小游戏优先走 InnerAudio 池播 SFX，可不预解码；仍尝试解码以便 WebAudio 路径
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
    this.resumeFromBackground();
    this.playBackground(this.bgVolume);
  };

  /** 切后台 */
  suspend() {
    try {
      this.background?.pause?.();
    } catch {
      /* ignore */
    }
    try {
      this.backgroundInner?.pause?.();
    } catch {
      /* ignore */
    }
    const ctx = this.listener?.context;
    if (ctx && typeof ctx.suspend === "function") void ctx.suspend();
  }

  /** 回前台：恢复 AudioContext + 背景音乐 */
  resumeFromBackground() {
    const ctx = this.listener?.context;
    if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
      void ctx.resume();
    }
    if (!this.unlocked) return;
    if (this.backgroundInner) {
      try {
        this.backgroundInner.play();
      } catch {
        /* ignore */
      }
    } else if (this.background) {
      try {
        if (!this.background.isPlaying) this.background.play();
      } catch {
        /* ignore */
      }
    } else {
      this.playBackground(this.bgVolume);
    }
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

  private playInnerOnce(url: string, volume: number) {
    const factory = (globalThis as { __wxCreateInnerAudio?: () => InnerAudio | null })
      .__wxCreateInnerAudio;
    const release = (globalThis as { __wxReleaseInnerAudio?: (a: InnerAudio) => void })
      .__wxReleaseInnerAudio;
    const inner = factory?.() ?? null;
    if (!inner) return null;
    try {
      inner.loop = false;
      inner.volume = volume;
      inner.src = url;
      const done = () => release?.(inner);
      if (typeof inner.onEnded === "function") inner.onEnded(done);
      if (typeof inner.onError === "function") inner.onError(done);
      inner.play();
      return inner;
    } catch (err) {
      console.warn("InnerAudio 播放失败:", err);
      release?.(inner);
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
    if (url) this.playInnerOnce(url, volume);
  }

  playBackground(volume = 0.25) {
    this.bgVolume = volume;
    if (this.background || this.backgroundInner) return;

    if (isMinigame() && this.bgUrl) {
      const factory = (globalThis as { __wxCreateInnerAudio?: () => InnerAudio | null })
        .__wxCreateInnerAudio;
      // BGM 单独实例，不进一次性池归还逻辑：直接 create 并保留
      const raw =
        typeof wx !== "undefined" && wx.createInnerAudioContext
          ? wx.createInnerAudioContext()
          : factory?.();
      if (!raw) return;
      try {
        raw.loop = true;
        raw.volume = volume;
        raw.src = this.bgUrl;
        raw.play();
        this.backgroundInner = raw;
      } catch (err) {
        console.warn("背景音乐 InnerAudio 失败:", err);
        try {
          raw.destroy();
        } catch {
          /* ignore */
        }
      }
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
    managers.delete(this);
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

declare const wx: {
  createInnerAudioContext?: () => InnerAudio;
} | undefined;

/** 给适配层 onShow/onHide 用 */
export function getAudioManagers(): AudioManager[] {
  return [...managers];
}

(globalThis as { __FIREWOOD_AUDIO_MANAGERS__?: () => AudioManager[] }).__FIREWOOD_AUDIO_MANAGERS__ =
  getAudioManagers;
