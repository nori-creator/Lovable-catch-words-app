import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { tStatic } from "@/lib/i18n";
import { reportLovableError } from "@/lib/lovable-error-reporting";

/**
 * **1つの欄が壊れても、画面ごと落とさない。**（オーナー報告 2026-09-29「設定のボタンを押すと
 * このエラー（読み込みに失敗しました）が出る」「アプリがすぐ止まる」）
 *
 * 原因は開発者の欄の1つ（画像生成の欄が Higgsfield を知らなかった）だったのに、React は
 * 描画の失敗を**いちばん近い受け止め役**まで持ち上げる。受け止め役がアプリの一番外にしか
 * 無かったので、設定の画面・下のバーごと「読み込みに失敗しました」に置き換わっていた。
 *
 * ここで欄ごとに受け止め、その欄だけ「表示できませんでした」＋エラーの内容＋やり直しに
 * する。ほかの欄・下のバーはそのまま使える。エラーは Lovable へも報告する。
 */
export class SafeSection extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SafeSection:${this.props.name}]`, error, info.componentStack);
    reportLovableError(error, { boundary: "safe_section", section: this.props.name });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        data-safe-section-failed={this.props.name}
        className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
      >
        <p className="text-footnote font-semibold text-destructive-ink">
          {tStatic("root.sectionFailed")}
        </p>
        <details className="mt-1 text-caption text-muted-foreground">
          <summary className="cursor-pointer">{tStatic("root.errorDetail")}</summary>
          <p className="mt-1 break-all">
            {this.props.name}: {error.message}
          </p>
        </details>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="press-in mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-footnote font-medium"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {tStatic("root.retry")}
        </button>
      </div>
    );
  }
}
