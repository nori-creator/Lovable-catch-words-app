/**
 * `run.mjs` の結果を、ブラウザで開くだけで見られる1枚のページにする。
 * 動画・録音・段ごとの絵・鳴った音・カクつき・見つけた問題を並べる。
 * GitHub の実行結果の画面に出す短い要約（Markdown）も返す。
 */
import fs from "node:fs";
import path from "node:path";

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

const RESULT_LABEL = {
  passed: "最後まで進めた",
  stuck: "途中で進めなくなった",
  error: "エラーで止まった",
  running: "未完了",
};

const SOUND_LABEL = {
  "media-play": "音声の再生",
  "media-ended": "音声の再生終わり",
  "media-error": "音声の読み込み失敗",
  "media-play-rejected": "音声の再生を拒否された",
  "sound-buffer": "効果音（Web Audio）",
  "sound-synth": "合成音（Web Audio）",
  speech: "読み上げ（端末の声）",
  vibrate: "振動",
  "camera-open": "カメラを開いた",
  "recorder-failed": "録音できなかった",
};

function issuesOf(run) {
  const all = rawIssues(run);
  // 同じ種類・同じ中身は1つに（段ごとに同じ物が出続けるので）。
  const seen = new Map();
  for (const i of all) {
    const k = `${i.kind}|${i.detail}`;
    if (seen.has(k)) seen.get(k).count++;
    else seen.set(k, { ...i, count: 1 });
  }
  return [...seen.values()];
}

function rawIssues(run) {
  const out = [];
  for (const s of run.steps) for (const i of s.issues) out.push({ where: s.label, ...i });
  for (const n of run.network)
    out.push({ where: "通信", kind: `通信 ${n.status}`, detail: `${n.url} ${n.detail}` });
  for (const c of run.console)
    if (c.type !== "warning") out.push({ where: "画面のエラー", kind: c.type, detail: c.text });
  for (const e of run.sounds)
    if (e.type === "media-error" || e.type === "media-play-rejected")
      out.push({ where: "音", kind: SOUND_LABEL[e.type], detail: e.src || e.error });
  return out;
}

function fpsLine(run) {
  if (!run.fps.length) return "記録なし";
  const vals = run.fps.map((f) => f.fps);
  const min = Math.min(...vals);
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const long = run.fps.reduce((a, f) => a + f.long, 0);
  const worst = run.fps.filter((f) => f.fps < 30).length;
  return `平均 ${avg} コマ/秒・最低 ${min}・カクついた秒 ${worst}・長いコマ ${long}`;
}

export function writeReport(out, runs, meta) {
  const sections = runs
    .map((run) => {
      const issues = issuesOf(run);
      const sounds = run.sounds.filter((e) => SOUND_LABEL[e.type]);
      return `
<section class="run" id="${esc(run.id)}">
  <h2>${esc(run.scenario === "first-run" ? "初めての人の流れ" : "ログイン後")} ・ ${esc(run.browser)} ・ 表示 ${esc(run.lang)} ・ 学習 ${esc(run.target)}</h2>
  <p class="result ${esc(run.result)}">${esc(RESULT_LABEL[run.result] ?? run.result)}（${run.steps.length} 段・${run.seconds ?? "?"} 秒）${run.note ? " — " + esc(run.note) : ""}</p>
  <div class="media">
    ${run.video ? `<div><h3>動画（アニメーションもそのまま）</h3><video controls preload="metadata" src="${esc(run.id)}/${esc(run.video)}"></video></div>` : ""}
    <div>
      <h3>録音（アプリが Web Audio で鳴らした音）</h3>
      ${run.audio ? `<audio controls src="${esc(run.id)}/${esc(run.audio)}"></audio>` : "<p>録音なし（Web Audio の音が鳴らなかった）</p>"}
      <h3>動きの滑らかさ</h3><p>${esc(fpsLine(run))}</p>
    </div>
  </div>
  <h3>見つけた問題（${issues.length}）</h3>
  ${
    issues.length
      ? `<table><tr><th>どこで</th><th>種類</th><th>中身</th></tr>${issues
          .slice(0, 80)
          .map(
            (i) =>
              `<tr><td>${esc(i.where)}${i.count > 1 ? `（ほか ${i.count - 1} 回）` : ""}</td><td>${esc(i.kind)}</td><td>${esc(i.detail)}</td></tr>`,
          )
          .join("")}</table>`
      : "<p>なし</p>"
  }
  <h3>鳴った音・振動（${sounds.length}）</h3>
  ${
    sounds.length
      ? `<table><tr><th>時刻(秒)</th><th>種類</th><th>中身</th></tr>${sounds
          .slice(0, 120)
          .map(
            (e) =>
              `<tr><td>${(e.t / 1000).toFixed(1)}</td><td>${esc(SOUND_LABEL[e.type])}</td><td>${esc(
                e.src ||
                  e.text ||
                  (e.duration != null ? `${e.duration} 秒` : "") ||
                  (e.hz ? `${e.wave} ${e.hz}Hz` : "") ||
                  e.pattern ||
                  e.constraints ||
                  "",
              )}</td></tr>`,
          )
          .join("")}</table>`
      : "<p>なし</p>"
  }
  <h3>段ごとの画面</h3>
  <div class="steps">
    ${run.steps
      .map(
        (
          s,
        ) => `<figure class="${s.issues.length ? "bad" : ""}"><a href="${esc(run.id)}/${esc(s.file)}"><img loading="lazy" src="${esc(run.id)}/${esc(s.file)}" alt=""></a>
      <figcaption><b>${esc(s.label)}</b><br><span>${esc(s.path)}</span>${s.issues
        .map((i) => `<br><em>${esc(i.kind)}: ${esc(i.detail)}</em>`)
        .join("")}</figcaption></figure>`,
      )
      .join("")}
  </div>
</section>`;
    })
    .join("\n");

  const rows = runs
    .map(
      (r) =>
        `<tr><td><a href="#${esc(r.id)}">${esc(r.scenario)} / ${esc(r.browser)} / ${esc(r.lang)} / ${esc(r.target)}</a></td><td class="${esc(r.result)}">${esc(RESULT_LABEL[r.result] ?? r.result)}</td><td>${issuesOf(r).length}</td><td>${r.sounds.filter((e) => SOUND_LABEL[e.type]).length}</td><td>${esc(fpsLine(r))}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CatchWords 実物確認</title>
<style>
:root{--bg:#f6f8fb;--fg:#111;--card:#fff;--line:#dde3ea;--ok:#0a7a3d;--ng:#b42318;--mute:#667}
@media (prefers-color-scheme: dark){:root{--bg:#0f1115;--fg:#eef;--card:#181b21;--line:#2a2f38;--ok:#4ade80;--ng:#f87171;--mute:#99a}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:0 0 6px}h3{font-size:15px;margin:16px 0 6px}
.run,.summary{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:16px 0}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top;word-break:break-all}
.passed{color:var(--ok);font-weight:600}.stuck,.error{color:var(--ng);font-weight:600}
.media{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
video{width:100%;max-width:390px;border-radius:12px;border:1px solid var(--line)}audio{width:100%}
.steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
figure{margin:0;border:1px solid var(--line);border-radius:10px;padding:6px;font-size:12px}figure.bad{border-color:var(--ng)}
figure img{width:100%;border-radius:6px}figure span{color:var(--mute)}figure em{color:var(--ng);font-style:normal}
.meta{color:var(--mute)}
</style></head><body>
<h1>CatchWords 実物確認</h1>
<p class="meta">対象: ${esc(meta.baseUrl)} ・ ${esc(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))} ・ ログイン後の確認: ${meta.signedIn ? "あり" : "なし（試験用アカウント未設定）"}</p>
<div class="summary"><h2>まとめ</h2><table><tr><th>回</th><th>結果</th><th>問題</th><th>音</th><th>滑らかさ</th></tr>${rows}</table></div>
${sections}
</body></html>`;
  fs.writeFileSync(path.join(out, "index.html"), html);
  fs.writeFileSync(
    path.join(out, "summary.json"),
    JSON.stringify(
      runs.map((r) => ({
        id: r.id,
        result: r.result,
        note: r.note,
        steps: r.steps.length,
        issues: issuesOf(r),
        sounds: r.sounds.length,
        fps: fpsLine(r),
      })),
      null,
      2,
    ),
  );

  const md = [
    `## CatchWords 実物確認（${meta.baseUrl}）`,
    "",
    "| 回 | 結果 | 問題 | 音 | 滑らかさ |",
    "|---|---|---|---|---|",
    ...runs.map(
      (r) =>
        `| ${r.scenario} / ${r.browser} / ${r.lang} / ${r.target} | ${RESULT_LABEL[r.result] ?? r.result} | ${issuesOf(r).length} | ${r.sounds.filter((e) => SOUND_LABEL[e.type]).length} | ${fpsLine(r)} |`,
    ),
    "",
    "動画・録音・段ごとの画面は、この実行の「Artifacts」の `real-app-report` をダウンロードして `index.html` を開く。",
    "",
  ].join("\n");
  return md;
}
