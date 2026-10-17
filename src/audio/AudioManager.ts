import * as THREE from "three";
import { SOUNDS, type SoundGroup } from "../config/assets";
import type { ProgressFn } from "../core/loading";

/**
 * 音效。
 *
 * 两件事值得说:
 * 1. 同一组音效连播时不能重样 —— 劈柴连着响三次一模一样的裂声非常出戏,
 *    所以随机取样时记住上一次的下标,强制换一个。
 * 2. 浏览器不允许未经交互就出声,AudioContext 必须等到第一次点击才能 resume。
 *    这里把恢复动作挂在全局首次 pointerdown 上。
 */
export class AudioManager {
  private readonly listener: THREE.AudioListener;
  private readonly buffers = new Map<SoundGroup, AudioBuffer[]>();
  private readonly lastIndex = new Map<SoundGroup, number>();
  private background: THREE.Audio | null = null;
  private unlocked = false;

  readonly ready: Promise<void>;

  constructor(camera: THREE.Camera, onProgress?: ProgressFn) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ready = this.loadAll(onProgress);

    window.addEventListener("pointerdown", this.unlock, { once: true });
    // 切后台再回来时 AudioContext 会被挂起,背景音得重新推一把
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.unlocked) this.resume();
    });
  }

  private async loadAll(onProgress?: ProgressFn) {
    const loader = new THREE.AudioLoader();

    const groups = Object.entries(SOUNDS) as Array<[SoundGroup, readonly string[]]>;
    await Promise.all(
      groups.map(async ([group, urls]) => {
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
    const ctx = this.listener.context;
    if (ctx.state === "suspended") void ctx.resume();
  }

  /** 从一组里随机取一个,但不重复上一次 */
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

  /**
   * 放一个一次性音效。
   * 每次都新建一个 Audio 对象,是为了让音效能叠着响 —— 复用一个的话
   * 连续劈砍会把前一声掐掉。
   */
  play(group: SoundGroup, volume = 1, detune = true) {
    if (!this.unlocked) return;
    const buffer = this.pick(group);
    if (!buffer) return;

    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    // 轻微随机变调,同一个采样重复播也不会显得机械
    if (detune) sound.setPlaybackRate(0.92 + Math.random() * 0.16);
    sound.onEnded = () => sound.disconnect();
    sound.play();
  }

  playBackground(volume = 0.25) {
    const buffer = this.pick("bg");
    if (!buffer || this.background) return;
    this.background = new THREE.Audio(this.listener);
    this.background.setBuffer(buffer);
    this.background.setLoop(true);
    this.background.setVolume(volume);
    this.background.play();
  }

  dispose() {
    this.background?.stop();
    this.background = null;
    this.listener.parent?.remove(this.listener);
  }
}
