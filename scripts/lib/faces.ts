/**
 * Cross-platform face finder for `npm run media`: face-api's SSD MobileNet model on TensorFlow's WASM
 * backend, so it runs the same on a Mac, on Linux in the cloud, anywhere Node runs. No native builds,
 * no network: the model ships inside the npm package and runs on the machine.
 */
import path from "node:path";
import sharp from "sharp";
import type { FaceBox } from "../../src/lib/content/focus";

/** Detections below this confidence are usually patterns in foliage or crowds, not faces. */
const MIN_CONFIDENCE = 0.5;
/** Long edge the photo is scaled to before detection: enough for faces a few percent of the frame wide. */
const DETECT_EDGE = 1024;

type FaceApi = typeof import("@vladmandic/face-api");
let ready: Promise<{ faceapi: FaceApi; tf: FaceApi["tf"] }> | null = null;

function load() {
  ready ??= (async () => {
    // The node-wasm build expects the WASM backend to be registered before it loads.
    const tf = await import("@tensorflow/tfjs");
    const wasm = await import("@tensorflow/tfjs-backend-wasm");
    wasm.setWasmPaths(path.join(path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm")), path.sep));
    await tf.setBackend("wasm");
    await tf.ready();
    const faceapi = (await import("@vladmandic/face-api/dist/face-api.node-wasm.js")) as unknown as FaceApi;
    const models = path.join(path.dirname(require.resolve("@vladmandic/face-api/package.json")), "model");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(models);
    return { faceapi, tf: faceapi.tf };
  })();
  return ready;
}

/** Face boxes as fractions of the (already upright) image, origin top-left. */
export async function findFaces(file: string): Promise<FaceBox[]> {
  const { faceapi, tf } = await load();
  const { data, info } = await sharp(file).resize(DETECT_EDGE, DETECT_EDGE, { fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
  try {
    const found = await faceapi.detectAllFaces(tensor as never, new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE }));
    return found.map((d) => ({ x: d.box.x / info.width, y: d.box.y / info.height, w: d.box.width / info.width, h: d.box.height / info.height }));
  } finally {
    tensor.dispose();
  }
}
