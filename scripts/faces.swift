// Face finder for `npm run media` (macOS only). Uses Apple's on-device Vision framework; nothing leaves
// the machine. Reads image paths as arguments and prints one JSON line per image:
//   {"file": "...", "faces": [{"x": 0.41, "y": 0.18, "w": 0.12, "h": 0.16}]}
// Boxes are fractions of the image with the origin at the TOP-left (Vision's own origin is bottom-left).
// Images must already be upright: the media script passes its EXIF-free, rotated web copies.
import Foundation
import Vision

struct Face: Encodable { let x: Double; let y: Double; let w: Double; let h: Double }
struct Result: Encodable { let file: String; let faces: [Face]; let error: String? }

let encoder = JSONEncoder()
for path in CommandLine.arguments.dropFirst() {
  var result = Result(file: path, faces: [], error: nil)
  let request = VNDetectFaceRectanglesRequest()
  do {
    try VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:]).perform([request])
    let faces = (request.results ?? []).map { o in
      Face(x: o.boundingBox.minX, y: 1 - o.boundingBox.maxY, w: o.boundingBox.width, h: o.boundingBox.height)
    }
    result = Result(file: path, faces: faces, error: nil)
  } catch {
    // One unreadable image must not stop the batch; the script falls back to its other focus method.
    result = Result(file: path, faces: [], error: error.localizedDescription)
  }
  if let line = try? encoder.encode(result), let text = String(data: line, encoding: .utf8) { print(text) }
}
