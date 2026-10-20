/** 极简 EventTarget，供 touch / 可见性事件用 */
class ListenerList {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, []);
    this.map.get(type).push(fn);
  }
  off(type, fn) {
    const list = this.map.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  emit(type, event) {
    const list = this.map.get(type);
    if (!list) return;
    for (const fn of list.slice()) fn.call(null, event);
  }
}

module.exports = { ListenerList };
