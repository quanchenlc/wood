/**
 * 9-slice 绘制：insets = [left, top, right, bottom] 源图像素。
 * 中心与边带拉伸，四角不拉伸。
 */
export function drawNineSlice(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  insets: readonly [number, number, number, number],
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

  let [L, T, R, B] = insets;
  L = Math.min(L, Math.floor(iw / 2));
  R = Math.min(R, Math.floor(iw / 2));
  T = Math.min(T, Math.floor(ih / 2));
  B = Math.min(B, Math.floor(ih / 2));

  const midW = Math.max(1, iw - L - R);
  const midH = Math.max(1, ih - T - B);
  const dMidW = Math.max(0, dw - L - R);
  const dMidH = Math.max(0, dh - T - B);

  const sx = [0, L, L + midW];
  const sy = [0, T, T + midH];
  const sw = [L, midW, R];
  const sh = [T, midH, B];
  const dxA = [dx, dx + L, dx + L + dMidW];
  const dyA = [dy, dy + T, dy + T + dMidH];
  const dwA = [L, dMidW, R];
  const dhA = [T, dMidH, B];

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

export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
) {
  const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLImageElement).width || 1;
  const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLImageElement).height || 1;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
