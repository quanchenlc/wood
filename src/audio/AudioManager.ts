import * as THREE from "three";
import { SOUNDS, type SoundGroup } from "../config/assets";
import type { ProgressFn } from "../core/loading";
import { isMinigame } from "../platform/env";
import {
  DEFAULT_SOUND_PACK,
  loadSoundSubpackage,
  readSoundPack,
  soundUrlsForPack,
  writeSoundPack,
  type SoundPackId,
} from "./soundPacks";

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

type SoundUrlMap = Record<SoundGroup, readonly string[]>;

/**
 * 音效。
 *
 * Web：THREE.Audio + AudioContext。
 * 小游戏：WebAudio（若可用）+ InnerAudio 对象池播 SFX；BGM 用独立 InnerAudio。
 * 初始化失败不挡游戏。支持音效包热切换（失败静默回退内置）。
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
  private urls: SoundUrlMap = soundUrlsForPack(DEFAULT_SOUND_PACK);
  private activePack: SoundPackId = DEFAULT_SOUND_PACK;
  private switching = false;

  readonly ready: Promise<void>;

  constructor(camera: THREE.Camera, onProgress?: ProgressFn) {
    managers.add(this);
    try {
      this.listener = new THREE.AudioListener();
      camera.add(this.listener);
      this.ready = this.boot(onProgress);
    } catch (err) {
      console.warn("音频初始化失败，本局静音:", err);
      this.disabled = true;
      this.listener = null;
      this.ready = this.skipProgress(onProgress);
    }

    window.addEventListener("pointerdown", this.unlock, { once: true });
    // 小游戏切前后台只走 adapter 的 wx.onHide/onShow，避免与 visibilitychange 双重 pause/play
    if (!isMinigame()) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.unlocked) this.resumeFromBackground();
        if (document.visibilityState === "hidden") this.suspend();
      });
    }
  }

  get packId(): SoundPackId {
    return this.activePack;
  }

  get isSwitching(): boolean {
    return this.switching;
  }

  private async skipProgress(onProgress?: ProgressFn) {
    const total = Object.values(SOUNDS).reduce((n, list) => n + list.length, 0);
    for (let i = 0; i < total; i++) onProgress?.();
  }

  private async boot(onProgress?: ProgressFn) {
    const preferred = readSoundPack();
    const total = Object.values(SOUNDS).reduce((n, list) => n + list.length, 0);
    let ticks = 0;
    const tick: ProgressFn = () => {
      ticks++;
      onProgress?.();
    };
    const ok = await this.applyPack(preferred, { persist: false, preview: false, onProgress: tick });
    if (!ok && preferred !== "legacy") {
      // 回退内置：不再重复打进度（下面补齐剩余 tick）
      await this.applyPack("legacy", { persist: false, preview: false });
    }
    while (ticks < total) tick();
  }

  private async loadBuffers(urls: SoundUrlMap, onProgress?: ProgressFn) {
    if (!this.listener) {
      await this.skipProgress(onProgress);
      return;
    }
    const loader = new THREE.AudioLoader();
    const groups = Object.entries(urls) as Array<[SoundGroup, readonly string[]]>;
    await Promise.all(
      groups.map(async ([group, list]) => {
        if (isMinigame() && group === "bg") {
          list.forEach(() => onProgress?.());
          this.buffers.set(group, []);
          return;
        }
        const loaded = await Promise.all(
          list.map((url) =>
            loader
              .loadAsync(url)
              .catch((err) => {
                console.warn(`音效加载失败,跳过 ${url}:`, err);
                return null;
              })
              .finally(() => onProgress?.()),
          ),
        );
        this.buffers.set(
          group,
          loaded.filter((b): b is AudioBuffer => b !== null),
        );
      }),
    );
  }

  private stopBackground() {
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
  }

  /**
   * 装载指定音效包。失败返回 false（调用方静默回退）；不弹 wx.show*。
   */
  private async applyPack(
    id: SoundPackId,
    opts: { persist: boolean; preview: boolean; onProgress?: ProgressFn },
  ): Promise<boolean> {
    try {
      await loadSoundSubpackage(id);
      const urls = soundUrlsForPack(id);
      await this.loadBuffers(urls, opts.onProgress);
      // 至少要有一组可播 SFX，否则视为失败
      const sfxCount =
        (this.buffers.get("split")?.length ?? 0) +
        (this.buffers.get("drop")?.length ?? 0) +
        (this.buffers.get("stack")?.length ?? 0);
      const hasInnerFallback = urls.split.length > 0;
      if (sfxCount === 0 && !hasInnerFallback) return false;

      this.urls = urls;
      this.activePack = id;
      if (opts.persist) writeSoundPack(id);

      this.stopBackground();
      if (this.unlocked) {
        this.playBackground(this.bgVolume);
        if (opts.preview) this.play("split", 1, true);
      }
      return true;
    } catch (err) {
      console.warn(`[audio] pack ${id} failed, will fall back:`, err);
      return false;
    }
  }

  /**
   * 玩家切换音效包：热替换 buffer、重开 BGM、预览一记劈柴。
   * 失败时静默回退到内置「旧版」（本局可播），不改已写入的偏好以外的 UI 提示。
   */
  async switchPack(id: SoundPackId): Promise<SoundPackId> {
    if (this.disabled) return this.activePack;
    if (id === this.activePack && !this.switching) {
      // 再点当前项：仍给一记预览
      if (this.unlocked) this.play("split", 1, true);
      return this.activePack;
    }
    this.switching = true;
    const prev = this.activePack;
    try {
      const ok = await this.applyPack(id, { persist: true, preview: true });
      if (ok) return this.activePack;
      // 静默回退内置
      const legacyOk = await this.applyPack("legacy", {
        persist: false,
        preview: true,
      });
      if (!legacyOk) {
        // 再试回上一包
        await this.applyPack(prev, { persist: false, preview: false });
      }
      return this.activePack;
    } finally {
      this.switching = false;
    }
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
    const list = this.urls[group];
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

    const bgUrl = this.urls.bg[0] ?? null;
    if (isMinigame() && bgUrl) {
      const factory = (globalThis as { __wxCreateInnerAudio?: () => InnerAudio | null })
        .__wxCreateInnerAudio;
      const raw =
        typeof wx !== "undefined" && wx.createInnerAudioContext
          ? wx.createInnerAudioContext()
          : factory?.();
      if (!raw) return;
      try {
        raw.loop = true;
        raw.volume = volume;
        raw.src = bgUrl;
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
    this.stopBackground();
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
