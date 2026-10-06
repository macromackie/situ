import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const target = "stories/assets/v1/assets";
await mkdir(target, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.evaluate("globalThis.__name = (value) => value");
  for (const [name, candidate] of [
    ["baseline_video", false],
    ["candidate_video", true],
  ] as const) {
    const result = await page.evaluate(async (candidate) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 288;
      const ctx = canvas.getContext("2d")!;
      const stream = canvas.captureStream(12);
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8",
        videoBitsPerSecond: 160000,
      });
      const chunks: Blob[] = [];
      const stopped = new Promise<Blob>((resolve) => {
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks));
      });
      let frame = 0;
      const draw = () => {
        ctx.fillStyle = "#edf2f6";
        ctx.fillRect(0, 0, 512, 288);
        ctx.fillStyle = "#c0ccd6";
        ctx.fillRect(90, 65, 305, 55);
        ctx.fillRect(90, 172, 305, 55);
        ctx.fillStyle = "#789b83";
        ctx.fillRect(415, 126, 18, 36);
        ctx.fillStyle = "#2168aa";
        ctx.beginPath();
        ctx.arc(
          60 + Math.min(frame, candidate ? 35 : 18) * 10,
          144 + (candidate ? 0 : Math.sin(frame) * 10),
          8,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = "#405669";
        ctx.font = "13px monospace";
        ctx.fillText("SYNTHETIC PLAYER FIXTURE", 18, 25);
        ctx.fillText(
          candidate ? "Candidate · seed 11" : "Baseline · seed 11",
          18,
          268,
        );
        frame++;
      };
      draw();
      recorder.start();
      const timer = setInterval(draw, 1000 / 12);
      await new Promise((r) => setTimeout(r, 3100));
      clearInterval(timer);
      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      const video = new Uint8Array(await (await stopped).arrayBuffer());
      const image = canvas.toDataURL("image/png").split(",")[1];
      return { video: Array.from(video), image };
    }, candidate);
    await writeFile(`${target}/${name}`, new Uint8Array(result.video));
    if (candidate)
      await writeFile(
        `${target}/example_image`,
        Buffer.from(result.image, "base64"),
      );
  }
} finally {
  await browser.close();
}
