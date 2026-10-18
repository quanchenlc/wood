/**
 * 9-slice：源 insets 用纹理像素，目标 insets 用逻辑 pt。
 * 绘制矩形需先 snap 到设备像素，避免半像素发糊。
 */

export type Insets = readonly [number, number, number, number];

export function snapPt(v: number, dpr: number): number {
  if (!dpr || dpr <= 0) return v;
  return Math.round(v * dpr) / dpr;
}

export function snapRect(
  x: number,
  y: number,
  w: number,
  h: number,
  dpr: number,
): { x: number; y: number; w: number; h: number } {
  const x1 = snapPt(x, dpr);
  const y1 = snapPt(y, dpr);
  const x2 = snapPt(x + w, dpr);
  const y2 = snapPt(y + h, dpr);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

/**
 * @param srcInsets 源图像素 [L,T,R,B]
 * @param dstInsets 目标逻辑 pt [L,T,R,B]；缺省时按源 insets 当 pt（兼容旧调用）
 */
export function drawNineSlice(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  srcInsets: Insets,
  dstInsets?: Insets,
  srcW?: number,
  srcH?: number,
) {
  const iw =
    srcW ??
    (img as HTMLImageElement).naturalWidth ??
    (img as HTMLImageElement).width ??
    0;
  const ih =
    srcH ??
    (img as HTMLImageElement).naturalHeight ??
    (img as HTMLImageElement).height ??
    0;
  if (!iw || !ih || dw <= 0 || dh <= 0) return;

  let [sL, sT, sR, sB] = srcInsets;
  sL = Math.min(sL, Math.floor(iw / 2));
  sR = Math.min(sR, Math.floor(iw / 2));
  sT = Math.min(sT, Math.floor(ih / 2));
  sB = Math.min(sB, Math.floor(ih / 2));

  let [dL, dT, dR, dB] = dstInsets ?? srcInsets;
  dL = Math.min(dL, dw / 2);
  dR = Math.min(dR, dw / 2);
  dT = Math.min(dT, dh / 2);
  dB = Math.min(dB, dh / 2);

  const midW = Math.max(1, iw - sL - sR);
  const midH = Math.max(1, ih - sT - sB);
  const dMidW = Math.max(0, dw - dL - dR);
  const dMidH = Math.max(0, dh - dT - dB);

  const sx = [0, sL, sL + midW];
  const sy = [0, sT, sT + midH];
  const sw = [sL, midW, sR];
  const sh = [sT, midH, sB];
  const dxA = [dx, dx + dL, dx + dL + dMidW];
  const dyA = [dy, dy + dT, dy + dT + dMidH];
  const dwA = [dL, dMidW, dR];
  const dhA = [dT, dMidH, dB];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (sw[col] <= 0 || sh[row] <= 0 || dwA[col] <= 0 || dhA[row] <= 0) continue;
      ctx.drawImage(
        img,
        sx[col],
        sy[row],
        sw[col],
        sh[row],
        dxA[col],
        dyA[row],
        dwA[col],
        dhA[row],
      );
    }
  }
}
