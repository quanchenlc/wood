const { ListenerList } = require("./event-target");

/**
 * 把 wx 触摸事件映射成 PointerEvent 风格，挂到 canvas / window 上。
 * CameraController 监听的是 pointerdown/move/up。
 */
function installTouchBridge(canvas, win) {
  const canvasListeners = new ListenerList();
  const origAdd = canvas.addEventListener ? canvas.addEventListener.bind(canvas) : null;
  const origRemove = canvas.removeEventListener ? canvas.removeEventListener.bind(canvas) : null;

  // 仿真触摸没有浏览器 Pointer 实体，setPointerCapture 会抛错并卡住 pointerId
  const safeCapture = () => {};
  const safeHasCapture = () => false;
  try {
    canvas.setPointerCapture = safeCapture;
    canvas.releasePointerCapture = safeCapture;
    canvas.hasPointerCapture = safeHasCapture;
  } catch {
    /* ignore */
  }

  canvas.addEventListener = (type, fn) => {
    if (String(type).startsWith("pointer") || String(type).startsWith("touch")) {
      canvasListeners.on(type, fn);
      return;
    }
    if (origAdd) origAdd(type, fn);
  };
  canvas.removeEventListener = (type, fn) => {
    if (String(type).startsWith("pointer") || String(type).startsWith("touch")) {
      canvasListeners.off(type, fn);
      return;
    }
    if (origRemove) origRemove(type, fn);
  };

  function emitPointer(type, touch, touches) {
    const event = {
      type,
      pointerId: touch.identifier ?? 1,
      pointerType: "touch",
      clientX: touch.clientX ?? touch.x ?? 0,
      clientY: touch.clientY ?? touch.y ?? 0,
      pageX: touch.pageX ?? touch.clientX ?? touch.x ?? 0,
      pageY: touch.pageY ?? touch.clientY ?? touch.y ?? 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      button: 0,
      isPrimary: true,
      touches,
      changedTouches: [touch],
      preventDefault() {},
      stopPropagation() {},
      target: canvas,
    };
    canvasListeners.emit(type, event);
    win.dispatchEvent(event);
  }

  function onStart(raw) {
    const touches = raw.touches || [];
    const changed = raw.changedTouches || touches;
    for (const t of changed) emitPointer("pointerdown", t, touches);
  }
  function onMove(raw) {
    const touches = raw.touches || [];
    const changed = raw.changedTouches || touches;
    for (const t of changed) emitPointer("pointermove", t, touches);
  }
  function onEnd(raw) {
    const touches = raw.touches || [];
    const changed = raw.changedTouches || touches;
    for (const t of changed) emitPointer("pointerup", t, touches);
  }
  function onCancel(raw) {
    const touches = raw.touches || [];
    const changed = raw.changedTouches || touches;
    for (const t of changed) emitPointer("pointercancel", t, touches);
  }

  if (typeof wx !== "undefined") {
    if (wx.onTouchStart) wx.onTouchStart(onStart);
    if (wx.onTouchMove) wx.onTouchMove(onMove);
    if (wx.onTouchEnd) wx.onTouchEnd(onEnd);
    if (wx.onTouchCancel) wx.onTouchCancel(onCancel);
  }

  // harness 也会往 canvas 派原生 pointer；保留双通道
  return { onStart, onMove, onEnd, onCancel, emitPointer };
}

module.exports = { installTouchBridge };
