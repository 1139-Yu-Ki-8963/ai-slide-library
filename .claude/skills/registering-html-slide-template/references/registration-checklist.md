# 型登録チェックリスト

## 共通シェル

- `.slide-viewport`で画面中央に配置する
- `.slide`を1280×720に固定する
- `Math.min(innerWidth/1280, innerHeight/720)`で縮小する
- `.slide-header`と`.slide-title`を使う
- `footer.slide-meta`を末尾に置く
- ページ背景とスライド面を分離する
- 375px幅で横スクロールを発生させない

## カタログ登録

- 蓄積簿に1行追加する
- カタログ生成スクリプトの型許可一覧を更新する
- HTMLと`サムネイル.png`を配置する
- `node scripts/build-catalog.mjs`が成功する
- 生成後の一覧にキー・型名・リンクがある
- スライドをコミットした後に再生成し、`updated`を同期する

## 公開確認

- 一覧URLがHTTP 200
- 個別HTMLがHTTP 200
- サムネイルがHTTP 200
- 一覧の更新日が想定日になっている
- 同日更新の並び順が仕様どおりである

## 保存先

Playwrightの検証用画像・trace・ログは、絶対パスで`~/agent-home/tools/MCP/playwright/`へ保存する。カタログが参照する公開サムネイルだけは、成果物として`slides/<key>/サムネイル.png`に保存する。
