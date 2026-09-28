/**
 * three.js の型の代わり（確認用ページの試作だけで使う）。
 *
 * `@types/three` は依存が多く、このリポジトリの bun.lock（Lovable の社内の置き場を
 * 指す）に足せないため、試作の間は**型の中身を any にして**使う（名前だけ宣言）。
 * 本番に入れる時に `@types/three` を正式に足してこのファイルを消す。
 */
declare module "three" {
  export type Group = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Group: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Object3D = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Object3D: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type BufferGeometry = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const BufferGeometry: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Vector3 = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Vector3: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Vector2 = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Vector2: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type WebGLRenderer = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const WebGLRenderer: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Mesh = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Mesh: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Texture = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Texture: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Scene = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Scene: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type PerspectiveCamera = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const PerspectiveCamera: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type OrthographicCamera = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const OrthographicCamera: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Raycaster = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Raycaster: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Color = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Color: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type CanvasTexture = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const CanvasTexture: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type PMREMGenerator = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const PMREMGenerator: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type MeshStandardMaterial = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const MeshStandardMaterial: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type MeshPhysicalMaterial = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const MeshPhysicalMaterial: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type MeshBasicMaterial = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const MeshBasicMaterial: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type ShaderMaterial = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const ShaderMaterial: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type PlaneGeometry = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const PlaneGeometry: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type BoxGeometry = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const BoxGeometry: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type SphereGeometry = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const SphereGeometry: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type CylinderGeometry = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const CylinderGeometry: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type HemisphereLight = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const HemisphereLight: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type SpotLight = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const SpotLight: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type DirectionalLight = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const DirectionalLight: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type PointLight = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const PointLight: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type AmbientLight = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const AmbientLight: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type TextureLoader = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const TextureLoader: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type BufferAttribute = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const BufferAttribute: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type InstancedMesh = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const InstancedMesh: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Points = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Points: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type PointsMaterial = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const PointsMaterial: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Quaternion = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Quaternion: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Euler = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Euler: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Matrix4 = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Matrix4: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Clock = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Clock: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type DataTexture = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const DataTexture: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const SRGBColorSpace: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const ACESFilmicToneMapping: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const NeutralToneMapping: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const AgXToneMapping: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const PCFSoftShadowMap: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const VSMShadowMap: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const RepeatWrapping: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const ClampToEdgeWrapping: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const FrontSide: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const BackSide: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const DoubleSide: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const AdditiveBlending: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const NormalBlending: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const MathUtils: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type InstancedBufferAttribute = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const InstancedBufferAttribute: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Sprite = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Sprite: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type SpriteMaterial = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const SpriteMaterial: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Object3DEventMap = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Sphere = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Sphere: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Float32BufferAttribute: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type TorusGeometry = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const TorusGeometry: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Fog = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Fog: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type ShadowMaterial = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const ShadowMaterial: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type Box3 = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const Box3: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export type LatheGeometry = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const LatheGeometry: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  export const GLTFLoader: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare module "three/examples/jsm/environments/RoomEnvironment.js" {
  export const RoomEnvironment: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare module "three/examples/jsm/postprocessing/EffectComposer.js" {
  export type EffectComposer = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const EffectComposer: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare module "three/examples/jsm/postprocessing/RenderPass.js" {
  export const RenderPass: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare module "three/examples/jsm/postprocessing/UnrealBloomPass.js" {
  export type UnrealBloomPass = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export const UnrealBloomPass: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare module "three/examples/jsm/postprocessing/OutputPass.js" {
  export const OutputPass: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
