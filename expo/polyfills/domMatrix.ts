type MatrixArrayInput = readonly number[] | Float32Array | Float64Array;

type MatrixInitObject = {
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  f?: number;
  m11?: number;
  m12?: number;
  m13?: number;
  m14?: number;
  m21?: number;
  m22?: number;
  m23?: number;
  m24?: number;
  m31?: number;
  m32?: number;
  m33?: number;
  m34?: number;
  m41?: number;
  m42?: number;
  m43?: number;
  m44?: number;
};

type MatrixSource = MatrixArrayInput | MatrixInitObject | string | SimpleDOMMatrix | SimpleDOMMatrixReadOnly | undefined;

type PointInit = {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
};

const identityTuple: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function parseStringInput(value: string): [number, number, number, number, number, number] {
  const parts = value.match(/-?\d*\.?\d+(e-?\d+)?/gi);
  if (!parts) {
    return [...identityTuple];
  }
  const numbers = parts.map(part => Number(part)).filter(num => Number.isFinite(num));
  if (numbers.length >= 16) {
    return [numbers[0], numbers[1], numbers[4], numbers[5], numbers[12], numbers[13]];
  }
  if (numbers.length >= 6) {
    return [numbers[0], numbers[1], numbers[2], numbers[3], numbers[4], numbers[5]];
  }
  return [...identityTuple];
}

function parseArrayInput(value: MatrixArrayInput): [number, number, number, number, number, number] {
  if (value.length >= 16) {
    return [value[0], value[1], value[4], value[5], value[12], value[13]];
  }
  if (value.length >= 6) {
    return [value[0], value[1], value[2], value[3], value[4], value[5]];
  }
  const fallback = [...identityTuple];
  for (let index = 0; index < value.length && index < 6; index += 1) {
    fallback[index] = value[index];
  }
  return fallback as [number, number, number, number, number, number];
}

function parseObjectInput(value: MatrixInitObject): [number, number, number, number, number, number] {
  const a = value.a ?? value.m11 ?? identityTuple[0];
  const b = value.b ?? value.m12 ?? identityTuple[1];
  const c = value.c ?? value.m21 ?? identityTuple[2];
  const d = value.d ?? value.m22 ?? identityTuple[3];
  const e = value.e ?? value.m41 ?? identityTuple[4];
  const f = value.f ?? value.m42 ?? identityTuple[5];
  return [a, b, c, d, e, f];
}

function multiplyTuples(first: [number, number, number, number, number, number], second: [number, number, number, number, number, number]): [number, number, number, number, number, number] {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function invertTuple(tuple: [number, number, number, number, number, number]): [number, number, number, number, number, number] {
  const [a, b, c, d, e, f] = tuple;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < Number.EPSILON) {
    throw new Error('DOMMatrix not invertible');
  }
  const inverseDeterminant = 1 / determinant;
  return [
    d * inverseDeterminant,
    -b * inverseDeterminant,
    -c * inverseDeterminant,
    a * inverseDeterminant,
    (c * f - d * e) * inverseDeterminant,
    (b * e - a * f) * inverseDeterminant,
  ];
}

class SimpleDOMPoint {
  x: number;

  y: number;

  z: number;

  w: number;

  constructor(init: PointInit = {}) {
    this.x = init.x ?? 0;
    this.y = init.y ?? 0;
    this.z = init.z ?? 0;
    this.w = init.w ?? 1;
  }

  static fromPoint(point?: PointInit | SimpleDOMPoint): SimpleDOMPoint {
    if (point instanceof SimpleDOMPoint) {
      return new SimpleDOMPoint({ x: point.x, y: point.y, z: point.z, w: point.w });
    }
    return new SimpleDOMPoint(point);
  }

  matrixTransform(matrix: SimpleDOMMatrix): SimpleDOMPoint {
    return matrix.transformPoint(this);
  }

  toJSON(): { x: number; y: number; z: number; w: number } {
    return { x: this.x, y: this.y, z: this.z, w: this.w };
  }
}

class SimpleDOMPointReadOnly extends SimpleDOMPoint {
  static fromPoint(point?: PointInit | SimpleDOMPoint): SimpleDOMPointReadOnly {
    const base = SimpleDOMPoint.fromPoint(point);
    return new SimpleDOMPointReadOnly({ x: base.x, y: base.y, z: base.z, w: base.w });
  }
}

class SimpleDOMMatrix {
  private tuple: [number, number, number, number, number, number];

  private m33Value: number;

  private m34Value: number;

  private m43Value: number;

  private m44Value: number;

  constructor(init?: MatrixSource) {
    this.tuple = [...identityTuple];
    this.m33Value = 1;
    this.m34Value = 0;
    this.m43Value = 0;
    this.m44Value = 1;
    if (init !== undefined) {
      this._setFromSource(init);
    }
  }

  get a(): number {
    return this.tuple[0];
  }

  set a(value: number) {
    this.tuple[0] = value;
  }

  get b(): number {
    return this.tuple[1];
  }

  set b(value: number) {
    this.tuple[1] = value;
  }

  get c(): number {
    return this.tuple[2];
  }

  set c(value: number) {
    this.tuple[2] = value;
  }

  get d(): number {
    return this.tuple[3];
  }

  set d(value: number) {
    this.tuple[3] = value;
  }

  get e(): number {
    return this.tuple[4];
  }

  set e(value: number) {
    this.tuple[4] = value;
  }

  get f(): number {
    return this.tuple[5];
  }

  set f(value: number) {
    this.tuple[5] = value;
  }

  get m11(): number {
    return this.a;
  }

  set m11(value: number) {
    this.a = value;
  }

  get m12(): number {
    return this.b;
  }

  set m12(value: number) {
    this.b = value;
  }

  get m21(): number {
    return this.c;
  }

  set m21(value: number) {
    this.c = value;
  }

  get m22(): number {
    return this.d;
  }

  set m22(value: number) {
    this.d = value;
  }

  get m13(): number {
    return 0;
  }

  set m13(_: number) {}

  get m14(): number {
    return 0;
  }

  set m14(_: number) {}

  get m23(): number {
    return 0;
  }

  set m23(_: number) {}

  get m24(): number {
    return 0;
  }

  set m24(_: number) {}

  get m31(): number {
    return 0;
  }

  set m31(_: number) {}

  get m32(): number {
    return 0;
  }

  set m32(_: number) {}

  get m33(): number {
    return this.m33Value;
  }

  set m33(value: number) {
    this.m33Value = value;
  }

  get m34(): number {
    return this.m34Value;
  }

  set m34(value: number) {
    this.m34Value = value;
  }

  get m41(): number {
    return this.e;
  }

  set m41(value: number) {
    this.e = value;
  }

  get m42(): number {
    return this.f;
  }

  set m42(value: number) {
    this.f = value;
  }

  get m43(): number {
    return this.m43Value;
  }

  set m43(value: number) {
    this.m43Value = value;
  }

  get m44(): number {
    return this.m44Value;
  }

  set m44(value: number) {
    this.m44Value = value;
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0 && this.m33Value === 1 && this.m34Value === 0 && this.m43Value === 0 && this.m44Value === 1;
  }

  get is2D(): boolean {
    return true;
  }

  get determinant(): number {
    return this.a * this.d - this.b * this.c;
  }

  multiplySelf(source: MatrixSource): SimpleDOMMatrix {
    const tuple = SimpleDOMMatrix._extract(source);
    this.tuple = multiplyTuples(this.tuple, tuple);
    return this;
  }

  multiply(source: MatrixSource): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.multiplySelf(source);
  }

  flipX(): SimpleDOMMatrix {
    return this.multiplySelf({ a: -1, d: 1 });
  }

  flipY(): SimpleDOMMatrix {
    return this.multiplySelf({ a: 1, d: -1 });
  }

  translateSelf(tx = 0, ty = 0, tz = 0): SimpleDOMMatrix {
    if (tz !== 0) {
      this.m43Value += tz;
    }
    return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  translate(tx = 0, ty = 0, tz = 0): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.translateSelf(tx, ty, tz);
  }

  scaleSelf(scaleX = 1, scaleY = 1, scaleZ = 1, originX = 0, originY = 0, originZ = 0): SimpleDOMMatrix {
    if (originZ !== 0) {
      this.m43Value += originZ - originZ * scaleZ;
    }
    if (originX !== 0 || originY !== 0) {
      this.translateSelf(originX, originY, 0);
      this.multiplySelf({ a: scaleX, d: scaleY });
      this.translateSelf(-originX, -originY, 0);
      return this;
    }
    this.multiplySelf({ a: scaleX, d: scaleY });
    return this;
  }

  scale(scaleX = 1, scaleY = 1, scaleZ = 1, originX = 0, originY = 0, originZ = 0): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.scaleSelf(scaleX, scaleY, scaleZ, originX, originY, originZ);
  }

  scaleNonUniform(scaleX = 1, scaleY = 1, scaleZ = 1): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.scaleSelf(scaleX, scaleY, scaleZ);
  }

  scaleNonUniformSelf(scaleX = 1, scaleY = 1, scaleZ = 1): SimpleDOMMatrix {
    return this.scaleSelf(scaleX, scaleY, scaleZ);
  }

  scale3d(scale = 1, originX = 0, originY = 0, originZ = 0): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.scale3dSelf(scale, originX, originY, originZ);
  }

  scale3dSelf(scale = 1, originX = 0, originY = 0, originZ = 0): SimpleDOMMatrix {
    return this.scaleSelf(scale, scale, scale, originX, originY, originZ);
  }

  rotateSelf(rotX = 0, rotY = 0, rotZ = 0): SimpleDOMMatrix {
    const angle = rotZ !== 0 ? rotZ : rotY !== 0 ? rotY : rotX;
    const radians = toRadians(angle);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotationTuple: [number, number, number, number, number, number] = [cos, sin, -sin, cos, 0, 0];
    this.tuple = multiplyTuples(this.tuple, rotationTuple);
    return this;
  }

  rotate(rotX = 0, rotY = 0, rotZ = 0): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.rotateSelf(rotX, rotY, rotZ);
  }

  rotateFromVector(x = 0, y = 0): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.rotateFromVectorSelf(x, y);
  }

  rotateFromVectorSelf(x = 0, y = 0): SimpleDOMMatrix {
    if (x === 0 && y === 0) {
      return this;
    }
    const angle = (Math.atan2(y, x) * 180) / Math.PI;
    return this.rotateSelf(0, 0, angle);
  }

  rotateAxisAngleSelf(_x = 0, _y = 0, _z = 1, angle = 0): SimpleDOMMatrix {
    return this.rotateSelf(0, 0, angle);
  }

  rotateAxisAngle(x = 0, y = 0, z = 1, angle = 0): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.rotateAxisAngleSelf(x, y, z, angle);
  }

  skewXSelf(angle = 0): SimpleDOMMatrix {
    const radians = toRadians(angle);
    const skewTuple: [number, number, number, number, number, number] = [1, 0, Math.tan(radians), 1, 0, 0];
    this.tuple = multiplyTuples(this.tuple, skewTuple);
    return this;
  }

  skewX(angle = 0): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.skewXSelf(angle);
  }

  skewYSelf(angle = 0): SimpleDOMMatrix {
    const radians = toRadians(angle);
    const skewTuple: [number, number, number, number, number, number] = [1, Math.tan(radians), 0, 1, 0, 0];
    this.tuple = multiplyTuples(this.tuple, skewTuple);
    return this;
  }

  skewY(angle = 0): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.skewYSelf(angle);
  }

  invertSelf(): SimpleDOMMatrix {
    this.tuple = invertTuple(this.tuple);
    return this;
  }

  inverse(): SimpleDOMMatrix {
    const result = new SimpleDOMMatrix(this);
    return result.invertSelf();
  }

  preMultiplySelf(source: MatrixSource): SimpleDOMMatrix {
    const tuple = SimpleDOMMatrix._extract(source);
    this.tuple = multiplyTuples(tuple, this.tuple);
    return this;
  }

  transformPoint(pointInit: PointInit = {}): SimpleDOMPoint {
    const point = pointInit instanceof SimpleDOMPoint ? pointInit : new SimpleDOMPoint(pointInit);
    const x = point.x * this.a + point.y * this.c + this.e;
    const y = point.x * this.b + point.y * this.d + this.f;
    const z = point.z * this.m33Value + this.m43Value;
    return new SimpleDOMPoint({ x, y, z, w: point.w });
  }

  toFloat32Array(): Float32Array {
    return new Float32Array([
      this.a,
      this.b,
      0,
      0,
      this.c,
      this.d,
      0,
      0,
      0,
      0,
      this.m33Value,
      this.m34Value,
      this.e,
      this.f,
      this.m43Value,
      this.m44Value,
    ]) as unknown as Float32Array;
  }

  toFloat64Array(): Float64Array {
    return new Float64Array([
      this.a,
      this.b,
      0,
      0,
      this.c,
      this.d,
      0,
      0,
      0,
      0,
      this.m33Value,
      this.m34Value,
      this.e,
      this.f,
      this.m43Value,
      this.m44Value,
    ]) as unknown as Float64Array;
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }

  setMatrixValue(value: string): SimpleDOMMatrix {
    this.tuple = parseStringInput(value);
    return this;
  }

  copy(): SimpleDOMMatrix {
    return new SimpleDOMMatrix(this);
  }

  toJSON(): Record<string, number> {
    return {
      a: this.a,
      b: this.b,
      c: this.c,
      d: this.d,
      e: this.e,
      f: this.f,
      m11: this.m11,
      m12: this.m12,
      m13: this.m13,
      m14: this.m14,
      m21: this.m21,
      m22: this.m22,
      m23: this.m23,
      m24: this.m24,
      m31: this.m31,
      m32: this.m32,
      m33: this.m33,
      m34: this.m34,
      m41: this.m41,
      m42: this.m42,
      m43: this.m43,
      m44: this.m44,
    };
  }

  _export(): [number, number, number, number, number, number] {
    return [...this.tuple];
  }

  private _setFromSource(source: MatrixSource): void {
    if (source === undefined) {
      return;
    }
    if (source instanceof SimpleDOMMatrix || source instanceof SimpleDOMMatrixReadOnly) {
      this.tuple = source._export();
      this.m33Value = source.m33Value;
      this.m34Value = source.m34Value;
      this.m43Value = source.m43Value;
      this.m44Value = source.m44Value;
      return;
    }
    if (typeof source === 'string') {
      this.tuple = parseStringInput(source);
      return;
    }
    if (source instanceof Float32Array || source instanceof Float64Array || Array.isArray(source)) {
      this.tuple = parseArrayInput(source);
      if (source.length >= 16) {
        this.m33Value = source[10];
        this.m34Value = source[11];
        this.m43Value = source[14];
        this.m44Value = source[15];
      }
      return;
    }
    const matrixObject = source as MatrixInitObject;
    this.tuple = parseObjectInput(matrixObject);
    if (typeof matrixObject.m33 === 'number') {
      this.m33Value = matrixObject.m33;
    }
    if (typeof matrixObject.m34 === 'number') {
      this.m34Value = matrixObject.m34;
    }
    if (typeof matrixObject.m43 === 'number') {
      this.m43Value = matrixObject.m43;
    }
    if (typeof matrixObject.m44 === 'number') {
      this.m44Value = matrixObject.m44;
    }
  }

  static fromMatrix(source?: MatrixSource): SimpleDOMMatrix {
    return new SimpleDOMMatrix(source);
  }

  static fromFloat32Array(array: Float32Array): SimpleDOMMatrix {
    return new SimpleDOMMatrix(array);
  }

  static fromFloat64Array(array: Float64Array): SimpleDOMMatrix {
    return new SimpleDOMMatrix(array);
  }

  static _extract(source: MatrixSource): [number, number, number, number, number, number] {
    if (source instanceof SimpleDOMMatrix || source instanceof SimpleDOMMatrixReadOnly) {
      return source._export();
    }
    if (typeof source === 'string') {
      return parseStringInput(source);
    }
    if (source instanceof Float32Array || source instanceof Float64Array || Array.isArray(source)) {
      return parseArrayInput(source);
    }
    if (source === undefined) {
      return [...identityTuple];
    }
    return parseObjectInput(source as MatrixInitObject);
  }
}

class SimpleDOMMatrixReadOnly extends SimpleDOMMatrix {}

const globalRecord = globalThis as Record<string, unknown>;

if (typeof globalRecord.DOMMatrix === 'undefined') {
  globalRecord.DOMMatrix = SimpleDOMMatrix;
}

if (typeof globalRecord.DOMMatrixReadOnly === 'undefined') {
  globalRecord.DOMMatrixReadOnly = SimpleDOMMatrixReadOnly;
}

if (typeof globalRecord.DOMPoint === 'undefined') {
  globalRecord.DOMPoint = SimpleDOMPoint;
}

if (typeof globalRecord.DOMPointReadOnly === 'undefined') {
  globalRecord.DOMPointReadOnly = SimpleDOMPointReadOnly;
}

export type { SimpleDOMMatrix };
