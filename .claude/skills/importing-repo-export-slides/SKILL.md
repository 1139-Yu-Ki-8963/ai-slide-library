---
name: importing-repo-export-slides
description: |
  repo-exportのHTMLを既存カタログと差分判定し、取り込み補正まで行う。
  TRIGGER when: 「repo-exportを登録して」「新デザインのスライドを取り込んで」「ダウンロードのスライドをカタログに反映して」時。
  SKIP: 個別スライドの新規作成・修正（generating-explanation-html-slides・adding-catalog-slidesの領分）、新しいスライド型の登録（registering-html-slide-template）。
invocation: importing-repo-export-slides
type: gateway
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# repo-exportスライド取り込み（importing-repo-export-slides）

ダウンロードフォルダに生成される「repo-export」「repo-export 2」のようなエクスポートフォルダから、新デザインのHTMLスライドを本リポジトリへ取り込む前段処理を担う。対象確定・差分判定・共有CSS判断・機械的補正までを完結させ、完了後は`adding-catalog-slides`のPhase A以降（分類・機械検証・AIレビュー・承認・登録・公開）へ引き継ぐ。本スキル自身は`slides/`への最終登録・commit・pushを行わない。

## 使用タイミング

- ダウンロードフォルダのrepo-export系フォルダから新デザインのHTMLスライドを取り込む時
- 複数バージョンのexportフォルダ（番号違い）が存在し、対象の絞り込みが必要な時

## 前提

- `ls ~/Downloads`がsandbox制限で`Operation not permitted`になる場合がある。その場合はFinder経由で複製する: `osascript -e 'tell application "Finder" to duplicate folder ((path to downloads folder as text) & "repo-export N") to POSIX file "$CLAUDE_JOB_DIR/tmp" with replacing'`。まず直接アクセス（`ls -la $HOME/Downloads/...`）を試し、失敗した場合のみFinder経由に切り替える
- 元のダウンロードフォルダは変更しない（複製先で作業する）
- 同梱の`導入手順.md`は内容が古い場合がある。実際のフォルダ構成を正とする

## Phase 1: 対象確定と既存カタログとの突合

### Step 1-1: 複数exportフォルダの包含関係確認

番号違いのexportフォルダが複数存在する場合、各フォルダの`slides/`配下のフォルダ名（キー）集合を比較し、包含関係（一方が他方の完全なスーパーセットか）を確認する。最大集合を持つフォルダのみを以降の対象にする。

### Step 1-2: 既存カタログとの機械的突合

既存`slides/`配下の全フォルダ名一覧と、対象フォルダのフォルダ名一覧を、Unicode正規化（NFC）を通してから比較する。`comm`はロケール・正規化形式（NFC/NFD）の差で誤判定するため、Node.js等で`String.normalize("NFC")`してから完全一致判定する。

```bash
node -e '
const fs=require("fs"); const n=s=>s.normalize("NFC");
const dirs=p=>fs.readdirSync(p,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>n(d.name));
const a=dirs("<既存slides/パス>");
const b=dirs("<対象exportのslides/パス>");
const A=new Set(a);
console.log("既存にもある: "); b.filter(x=>A.has(x)).forEach(x=>console.log(x));
console.log("existing側に無い(新規候補): "); b.filter(x=>!A.has(x)).forEach(x=>console.log(x));
'
```

### Step 1-3: 3分類の確定

キー一致判定の結果を次の3分類に振り分ける。

| 分類 | 判定基準 |
|---|---|
| 新規追加 | 既存にキーがない |
| 差し替え候補 | 既存にキーがある、または既存に類似名があり中身の比較が必要 |
| 取り込み不要 | 既存側が新デザイン文言なし・padding直接指定なしの補正済み状態であれば、既存のほうが正しい |

既存側が既に補正済み（`<title>`に「新デザイン」等の文言が残っておらず、`.slide{padding}`の直接上書きもない）状態なら、同名キーは「取り込み不要」と判定する。名称が近似するが完全一致しないキーは、本文を読んで同一主題の亜種か無関係の新規かを判断し、候補として提示する（機械的に断定しない）。

完了条件: 対象exportフォルダが1つに絞り込まれ、全キーが新規追加／差し替え候補／取り込み不要のいずれかに分類されていること

## Phase 2: 共有CSS・デザイン仕様の取り込み判断

### Step 2-1: 3条件チェック

同梱の`assets/shared-slide-shell.css`と`references/slide-design-system.md`は、公開中のものより古い可能性が高い。次のいずれかに該当すれば取り込まない（既定は不取り込み）。

- Google Fontsの`@import`が含まれる
- `Shippori Mincho`が含まれる
- `.slide`のpaddingが公開中の値と異なる（現行値は都度`assets/shared-slide-shell.css`を実測して確認する。ハードコードした数値を鵜呑みにしない）

### Step 2-2: 判断がつかない場合

上記3条件のいずれにも該当しないが差分がある場合、差分をユーザーに提示して確認する。

完了条件: 共有CSS・デザイン仕様を取り込むか否かが確定していること（既定は不取り込み）

## Phase 3: 取り込み対象の機械的補正

### Step 3-1: 共有CSSタグの位置補正

同梱スライドは共有CSSの`<link rel="stylesheet" data-shared-slide-shell>`と`<script defer data-shared-slide-shell-script>`が独自`<style>`より前（7行目付近）にある場合がある。これを`</style>`の直後・`</head>`の直前へ、同じ順序で移動する。正しい形の見本は既存の登録済みスライド（例: `slides/レビューエンジン-3層構成/解説スライド.html`）を参照する。

### Step 3-2: padding直接指定の削除

`<style>`内に`.slide{ padding: ... }`の直接記述があれば削除する（共有CSS側の値に委ねる）。

### Step 3-3: titleの確認

`<title>`に「（新デザイン）」「（新デザイン v2）」等の作業中を示す文言が残っていないか全件確認し、除去する。同一シリーズの複数スライドは`<ツール名>｜<共通の名前>`の形で統一されているか確認する。タイトルが40字を超え実描画ではみ出す場合、文言を勝手に決めず候補を提示してユーザーに選んでもらう。

完了条件: 新規追加・差し替え確定分の全HTMLが、共有CSSタグ位置・padding直接指定なし・title文言の3点で補正済みであること

## Phase 4: 承認とフロー引き継ぎ

### Step 4-1: 分類結果の提示と承認

Phase 1〜3の結果（新規追加／差し替え／取り込み不要の各キー一覧、共有CSS取り込み可否）をユーザーへ提示し承認を得る。

- 削除相当の判断（差し替えによる既存ファイルの置き換え）は1件ずつ挙げて承認を得る。「まとめて整理」「不要と思われる」で削除しない
- 承認の解釈が曖昧なときはその解釈を明示して確認し直す
- 削除・置き換え前に必ず`git diff --cached --name-status | awk '$1=="D"'`で消えるファイルを全件確認し、承認を得る

### Step 4-2: adding-catalog-slidesへの引き継ぎ

承認後、補正済みHTMLを`slides/<キー>/`へ配置し、`adding-catalog-slides`を起動する。以降の変更分類（Phase A）・機械検証（Phase C）・AIレビュー（Phase D）・ユーザー承認（Phase E）・登録・カタログ再生成（Phase F）・commit・push（Phase G）は`adding-catalog-slides`側で完結させる。本スキルはPhase F・Gの登録・公開を代行しない。

完了条件: 承認済みの対象が`slides/`へ配置され、`adding-catalog-slides`が起動されていること

## 完了条件

| Phase | 完了条件 |
|---|---|
| Phase 1 | 対象exportフォルダが1つに絞り込まれ、全キーが3分類のいずれかに分類されている |
| Phase 2 | 共有CSS・デザイン仕様の取り込み可否が確定している |
| Phase 3 | 対象HTML全件が共有CSSタグ位置・padding・title文言の3点で補正済みである |
| Phase 4 | 承認済み対象が`slides/`へ配置され、`adding-catalog-slides`へ引き継がれている |
| **Goal** | 新規・差し替え対象が正しく補正された状態で`adding-catalog-slides`のPhase Aへ引き継がれ、最終的な検証・公開は同スキル側で完結する |

## 絶対に守ること

- スライドの削除・置き換えは1件ずつ挙げてユーザーの承認を得てから行う。「まとめて整理します」「不要と思われます」で削除しない
- 承認の解釈が曖昧なときは、その解釈を明示して確認し直す
- 削除・置き換え前に必ず`git diff --cached --name-status | awk '$1=="D"'`で消えるファイルを全件確認し、承認を得る
- 公開（push・マージ）はこのスキルの責務ではなく、`adding-catalog-slides`のPhase Gでユーザーの明示承認後にのみ行われる

## サブエージェント委任仕様

| 呼び出し箇所 | 役割 | Claude agent | Codex agent | prompt骨格 | 期待返却値 |
|---|---|---|---|---|---|
| Phase 1 差分把握 | 事実確認 | investigator | investigator-terra | 対象exportフォルダパス・既存slides/パス・確認項目（キー一覧・NFC正規化突合・CSS差分）・変更禁止 | 証拠付きの3分類結果 |
| Phase 3 補正実行 | ファイル反映 | worker-sonnet | worker-terra | 確定済み補正内容（共有CSSタグ移動・padding削除・title修正）・対象HTMLパス一覧・完了条件 | 変更結果 |

- Claude Code: `Claude agent`列を`Agent(subagent_type: ...)`に渡す
- Codex: `Codex agent`列の`~/agent-home/agents/codex/<name>/<name>.md`を全文読み、定義の`model`・`reasoning_effort`・本文と共通promptを`spawn_agent`に渡す
- prompt骨格と期待返却値は両ランタイムで共通とし、モデル値をSkill側へ重複記載しない

## 予想を裏切る挙動

- 複数exportフォルダは包含関係にあることが多い。番号が大きいフォルダが必ずしも対象の全てとは限らないため、包含関係を機械的に確認してから最大集合のみを扱う
- 既存にキーがあっても、既存側が既に別の作業で補正済みなら「取り込み不要」が正しい。exportフォルダの内容が新しく見えても、実際には既存版のほうが新しい場合がある
- 共有CSS・デザイン仕様は複製せず、既存正本を参照するだけで良い。取り込み条件に反する場合は無条件に不採用とする

## 参照資料

- `.claude/skills/adding-catalog-slides/SKILL.md` — 本スキル完了後に引き継ぐ登録・検証・公開フロー
- `.claude/skills/registering-html-slide-template/SKILL.md` — 新しいスライド型を登録する場合はこちら（本スキルの対象外）
- `slides/レビューエンジン-3層構成/解説スライド.html` — 共有CSSタグ位置・補正済みHTMLの見本
- `docs/スライド蓄積簿.md` — 既存カタログの正本
- `assets/shared-slide-shell.css` — 公開中の共有CSS正本

## 完了報告

`~/agent-home/skills/managing-agent-configs/references/skills/completion-report-format.md`の共通骨格（作業報告型）に従い、Phase 1〜4の結果（3分類件数、共有CSS取り込み可否、補正件数、`adding-catalog-slides`への引き継ぎの成否）を報告する。
