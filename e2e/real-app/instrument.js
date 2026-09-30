/**
 * 本物のアプリのページに**最初に**差し込む計測（Playwright の addInitScript）。
 *
 * ## 何を記録するか
 * - 音: `<audio>` の再生・失敗・終わり、Web Audio で鳴った音（効果音・合成音）、
 *   読み上げ（speechSynthesis）。さらに Web Audio の出力を**そのまま録音**する
 *   （スピーカーへ行く線に、録音機への線を1本足すだけ。音も動きも変えない）。
 * - 動き: 1秒ごとのコマ数（fps）と、50ms を超えたコマ（カクつき）の数。
 * - 振動: `navigator.vibrate` を呼んだ記録。
 * - カメラ: `getUserMedia` を、本物の写真を映すカメラに差し替える
 *   （`window.__QA_CAMERA_IMAGE__` に写真の data URL が入っているときだけ）。
 *   撮った後の AI 解析は本物のサーバで動く。
 *
 * アプリのコードには一切手を入れない。ここは試験の時だけ差し込まれる。
 */
(() => {
  const W = window;
  if (W.__qa) return;
  const qa = { events: [], fps: [], audioChunks: [], recorders: [] };
  W.__qa = qa;
  const now = () => Math.round(performance.now());
  const log = (type, data) => qa.events.push({ t: now(), type, ...data });
  const short = (s) => String(s || "").slice(0, 160);

  // ---- <audio> / <video> の再生 ------------------------------------------
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    const el = this;
    const src = short(el.currentSrc || el.src);
    if (el.tagName === "AUDIO" || !el.muted) {
      log("media-play", { src, tag: el.tagName });
      el.addEventListener(
        "error",
        () => log("media-error", { src, code: el.error ? el.error.code : null }),
        { once: true },
      );
      el.addEventListener(
        "ended",
        () => log("media-ended", { src, duration: Number(el.duration.toFixed(2)) }),
        { once: true },
      );
    }
    const p = origPlay.apply(el, args);
    if (p && p.catch) p.catch((e) => log("media-play-rejected", { src, error: short(e) }));
    return p;
  };

  // ---- Web Audio（効果音・合成音）と、その録音 --------------------------------
  const recordTargets = new WeakMap();
  function startRecorder(stream) {
    if (!W.MediaRecorder) return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
      (m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m),
    );
    try {
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) qa.audioChunks.push(e.data);
      };
      rec.start(500);
      qa.recorders.push(rec);
      qa.audioMime = rec.mimeType || mime || "audio/webm";
    } catch (e) {
      log("recorder-failed", { error: short(e) });
    }
  }
  if (W.AudioNode && W.AudioDestinationNode) {
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const out = origConnect.call(this, dest, ...rest);
      try {
        if (dest instanceof AudioDestinationNode) {
          const ctx = this.context;
          let tap = recordTargets.get(ctx);
          if (!tap) {
            tap = ctx.createMediaStreamDestination();
            recordTargets.set(ctx, tap);
            startRecorder(tap.stream);
          }
          origConnect.call(this, tap);
        }
      } catch {
        /* 録音できなくても、音そのものは鳴らす */
      }
      return out;
    };
  }
  if (W.AudioBufferSourceNode) {
    const origStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      log("sound-buffer", {
        duration: this.buffer ? Number(this.buffer.duration.toFixed(2)) : null,
      });
      return origStart.apply(this, a);
    };
  }
  if (W.OscillatorNode) {
    const origOsc = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...a) {
      log("sound-synth", { wave: this.type, hz: Math.round(this.frequency.value) });
      return origOsc.apply(this, a);
    };
  }
  if (W.speechSynthesis) {
    const speak = W.speechSynthesis.speak.bind(W.speechSynthesis);
    W.speechSynthesis.speak = (u) => {
      log("speech", { text: short(u.text), lang: u.lang });
      return speak(u);
    };
  }
  if (navigator.vibrate) {
    const vib = navigator.vibrate.bind(navigator);
    navigator.vibrate = (p) => {
      log("vibrate", { pattern: JSON.stringify(p) });
      return vib(p);
    };
  }

  // ---- 動きの滑らかさ（1秒ごとのコマ数） -------------------------------------
  let last = performance.now();
  let frames = 0;
  let long = 0;
  let windowStart = last;
  const tick = (t) => {
    const dt = t - last;
    last = t;
    frames++;
    if (dt > 50) long++;
    if (t - windowStart >= 1000) {
      qa.fps.push({ t: Math.round(t), fps: frames, long });
      frames = 0;
      long = 0;
      windowStart = t;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // ---- 本物の写真を映すカメラ -------------------------------------------------
  const photo = W.__QA_CAMERA_IMAGE__;
  if (photo) {
    const img = new Image();
    img.src = photo;
    const fake = async (constraints) => {
      log("camera-open", { constraints: short(JSON.stringify(constraints)) });
      if (!constraints || !constraints.video) throw new DOMException("no video", "NotFoundError");
      await img.decode().catch(() => {});
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 960;
      const g = c.getContext("2d");
      const draw = () => {
        // 写真を画面いっぱいに（はみ出す分は切る）。
        const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight) || 1;
        const w = img.naturalWidth * s;
        const h = img.naturalHeight * s;
        g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      };
      draw();
      const stream = c.captureStream(24);
      // 映像を止めないように描き続ける（止まった映像を「黒い画面」と判じる端末対策）。
      const iv = setInterval(draw, 200);
      stream.getVideoTracks()[0].addEventListener("ended", () => clearInterval(iv));
      return stream;
    };
    // WebKit（Safari と同じ仕組み）は呼び口を `MediaDevices.prototype` に持つので、
    // 端末の物（navigator.mediaDevices）だけ差し替えても効かない。両方を差し替える。
    const put = (target) => {
      if (!target) return;
      try {
        Object.defineProperty(target, "getUserMedia", {
          value: fake,
          configurable: true,
          writable: true,
        });
      } catch {
        /* 差し替えられない所は飛ばす */
      }
    };
    if (W.MediaDevices) put(MediaDevices.prototype);
    if (!navigator.mediaDevices) {
      try {
        Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
      } catch {
        /* 無い端末ではカメラ無しのまま */
      }
    }
    put(navigator.mediaDevices);
    // 許可の状態を聞かれたら「許可済み」と答える（本物の許可の画面は出さない）。
    if (navigator.permissions && navigator.permissions.query) {
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (desc) =>
        desc && (desc.name === "camera" || desc.name === "microphone")
          ? Promise.resolve({ state: "granted", addEventListener() {}, removeEventListener() {} })
          : query(desc);
    }
  }
})();
