// Reads the place names printed on the reference map with Apple's Vision framework (macOS only).
// Prints one JSON line per text: {"t": text, "x": cx, "y": cy, "w": w, "h": h, "c": confidence} in reference pixels.
// Usage: swift tools/ocr.swift reference/leonida.png > /tmp/ocr.jsonl
import AppKit
import Vision

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("cannot read \(path)") }
let W = cg.width, H = cg.height
let tile = 1400, step = 1100
var y = 0
while y < H {
  var x = 0
  while x < W {
    let tw = min(tile, W - x), th = min(tile, H - y)
    if let sub = cg.cropping(to: CGRect(x: x, y: y, width: tw, height: th)) {
      let req = VNRecognizeTextRequest()
      req.recognitionLevel = .accurate
      req.usesLanguageCorrection = false
      req.minimumTextHeight = 0.006
      try? VNImageRequestHandler(cgImage: sub, options: [:]).perform([req])
      for o in req.results ?? [] {
        guard let c = o.topCandidates(1).first else { continue }
        let b = o.boundingBox
        let cx = Double(x) + b.midX * Double(tw), cy = Double(y) + (1 - b.midY) * Double(th)
        let t = c.string.replacingOccurrences(of: "\\", with: "").replacingOccurrences(of: "\"", with: "'")
        print("{\"t\":\"\(t)\",\"x\":\(Int(cx)),\"y\":\(Int(cy)),\"w\":\(Int(b.width * Double(tw))),\"h\":\(Int(b.height * Double(th))),\"c\":\(String(format: "%.2f", c.confidence))}")
      }
    }
    if x + tw >= W { break }
    x += step
  }
  if y + tile >= H { break }
  y += step
}
