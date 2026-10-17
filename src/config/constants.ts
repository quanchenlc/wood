/**
 * 全局常量。
 *
 * 场景按真实英制尺寸建模(一根柴火 12~16 英寸长),再统一换算成米交给 three.js,
 * 所以下面所有尺寸都写成 `<英寸数> * INCH` 的形式,改起来直观。
 */

export const INCH = 0.0254;
export const FOOT = 0.3048;

export const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

/** 地面高度。树桩坐在 y=0,草和落地的柴火以此为基准。 */
export const GROUND_Y = -0.33;

export const CAMERA = {
  fov: 55,
  near: 0.01,
  far: 100,
  /** 初始水平角(弧度),从 +X 轴逆时针起算 */
  azimuth: Math.PI * 0.5,
  /** 俯仰角约 20.6°：比之前稍高，但没有直接跳到参考站约 46° 的强俯视 */
  elevation: 0.36,
  distance: 1.9,
  /** 看向树桩顶面稍上方 */
  target: 0.13,
  /** 拖拽灵敏度:一个屏幕宽度对应多少弧度 */
  dragSpeed: Math.PI * 1.1,
  /** 松手后的惯性衰减(每秒保留比例) */
  damping: 0.0015,
  /** 超过这个像素位移就判定为拖拽而非点击 */
  clickSlopPx: 6,
} as const;

export const LIGHTING = {
  sunColor: 0xfff2cc,
  sunIntensity: 4,
  ambientColor: 0xbad8ff,
  ambientIntensity: 2,
  /** 太阳方位角 / 仰角,决定影子往哪边倒 */
  sunAzimuth: (120 * Math.PI) / 180,
  sunElevation: (30 * Math.PI) / 180,
  sunDistance: 8,
  shadowMapSize: IS_MOBILE ? 2048 : 4096,
  /** 正交阴影相机半径,刚好罩住树桩 + 柴堆 */
  shadowExtent: 6,
  shadowNear: 0.1,
  shadowFar: 50,
  shadowNormalBias: 0.005,
  shadowRadius: 4,
  shadowBlurSamples: 8,
} as const;

export const POST = {
  /** 景深焦平面距离,对准树桩顶面 */
  focus: 1.9,
  aperture: IS_MOBILE ? 0.006 : 0.003,
  maxBlur: 1,
} as const;

export const PHYSICS = {
  gravity: -15,
  solverIterations: 5,
  friction: 0.8,
  restitution: 0.15,
} as const;

/** 程序化原木的尺寸与形状噪声 */
export const LOG = {
  minDiameterIn: 9,
  maxDiameterIn: 16,
  minLengthIn: 12,
  maxLengthIn: 16,
  radialSegments: 32,
  heightSegments: 8,
  /** 半径扰动幅度(英寸)。树干下粗上细,底部再多给一点。 */
  bulgeIn: 0.4,
  bulgeTaper: 0.1,
} as const;

/**
 * 柴堆:围着树桩排成一段圆弧,堆满一层往外推一层。
 *
 * 参数与参考 bundle 的 QC 构造器一致。
 */
export const PILE = {
  startAngle: (320 * Math.PI) / 180,
  arcSpan: (230 * Math.PI) / 180,
  radiusIn: 60,
  tierDepthIn: 18,
  /** 一层最多摞几行,摞满就整体往外退一圈 */
  maxRows: 5,
} as const;

export const GRASS = {
  count: IS_MOBILE ? 4000 : 10000,
  /** 树桩底座半径以内不长草 */
  innerRadius: 12 * INCH + 0.01,
  outerRadius: 10 * FOOT,
  bladeWidth: 0.008,
  minHeight: 0.05,
  maxHeight: 0.1,
  /** 草叶自然弯曲量 */
  bend: 0.02,
  /** 密度向外衰减指数,越大越集中在中心 */
  densityFalloff: 1.5,
  windStrength: 0.012,
  windSpeed: 1.2,
} as const;

/** 劈砍时的镜头抖动 */
export const SHAKE = {
  amplitude: 0.012,
  duration: 0.28,
  frequency: 34,
} as const;
