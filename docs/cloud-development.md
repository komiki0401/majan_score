# クラウド環境で開発を再開する

## 引き継ぎ状態（2026-11-04）

- リポジトリ: `https://github.com/komiki0401/majan_score`
- 開始時点のローカル変更: なし。アプリの最終変更 `45239d8` はGitHub mainへ反映済み。
- 直近の実装: 短縮閲覧URLと編集キーの分離、MFA必須の運営者管理画面、グループ無効化・復元・JSONバックアップ・完全削除。一時DBと画面のテストを収録。
- Node **24.x** / npm **11.x**。`.nvmrc` に24を指定し、GitHub Actionsも24を使用。
- クラウドへの移行のために本番データを移動したり、Supabaseを作り直す必要はない。
- 通常のコード変更は `AGENTS.md` に従い、全検証後にmainへfast-forwardでPushし、Actionsと公開URLを確認する。

最新状態は本書追加後の **GitHub main** です。Windowsのローカルパス、認証情報、ブラウザ内のサンプルデータや記憶した編集キーはクラウドへ引き継がれません。共有URLは安全な保管先から開いてください。URLやキーをIssue・コミット・作業ログへ貼り付けないでください。

## 最初の起動（Linux / Bash）

クラウド側のGitHub接続で、このリポジトリの読み取りと、必要なら書き込みを許可します。既存の作業コピーがある場合は先に `git status` と接続先を確認し、未コミット変更や分岐があれば上書きせず調査してください。

```bash
git clone https://github.com/komiki0401/majan_score.git
cd majan_score
git switch main
git pull --ff-only origin main
git switch -c codex/cloud-$(date +%Y%m%d)
```

`AGENTS.md` と本書を読んでから作業します。Nodeのバージョン管理にnvmを使える環境なら、次で `.nvmrc` の指定へ合わせます。nvmがなければクラウド側のランタイム設定でNode24を選んでください。Node26でテストしないでください。

```bash
nvm install
nvm use
node --version
npm --version
npm ci
npm test
npm run typecheck
npm run build
npm run dev -- --host 0.0.0.0
```

開発環境が用意する**非公開のポートプレビュー**で5173番を開きます。Viteが別ポートを表示した場合はそちらを使います。サンプル確認はプレビューURLの末尾に `#sample` を付けます。クラウドでは `localhost` は自分のスマホを指すため、スマホにはクラウド側のプレビューURLを使ってください。プレビューを意図せず一般公開しないでください。

Node24付属以外のnpmを使う環境では、npmも11.xに合わせます。`npm ci` はロックファイルを使い、引き継ぎだけを目的に依存関係を更新しません。既存フォルダーでブランチ名が使われている場合は別の `codex/` 名を選んでください。

## Supabaseの接続設定

本番と同じプロジェクトの、次の**公開用**設定だけをクラウド環境の環境変数設定へ登録します。

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

値は既存Supabaseの接続設定またはGitHubリポジトリのActions Variablesで、運営者が確認してください。値をチャットやGitHubソースへ貼り付ける必要はありません。設定後は開発サーバーを再起動します。Actionsの既存Variablesを削除・変更しないでください。GitHubのVariablesはクローン先へ自動的には配布されません。

必要ならクラウド作業環境内だけに `.env.local` を作れますが、既存ファイルを上書きしないでください。Windowsの `.env.local` はGitへ追加せず、このPCに残します。`.env.example` は変数名とダミー値だけの見本です。Secret Key、service_role、DBパスワード、管理者パスワード・MFA秘密情報、GitHubトークンを `VITE_*`・リポジトリ・フロントエンドへ設定しないでください。

公開設定なしでもサンプルを使った画面開発と一時DBのテストはできます。ただし `npm run verify` の最後の実接続検査には上記2変数とSupabaseへのHTTPS接続が必要です。接続できなければ原因を報告し、検査を省略して公開しないでください。

## 本番データを保護する

- UI操作の検証は `#sample` または一時DBで行う。本番グループ・大会で登録、編集、無効化、エクスポート確認記録作成、削除をテストしない。
- `npm run verify` の実接続検査はGETのみ。本番SQLは自動適用しない。クラウド移行を理由に `setup.sql` 等を再実行しない。
- 前回の実接続検査（2026-11-03）では短縮URL・管理画面用SQLは適用済み、無効化・削除用 `group-lifecycle.sql` は未適用だった。現在の適用状況は移行後にGET検査で再確認する。管理RPCを試しに実行して確認しない。
- 設定と権限の詳細は [短縮URL・管理者認証](service-management.md)、[無効化・削除範囲](group-lifecycle.md) を参照。MFAを省略する代替実装を作らない。

## 変更完了後

```bash
npm run verify
git status --short
git diff --check
```

すべて成功後、今回変更したファイルだけを個別にstageしてcommitします。`.env.local`、本物の環境設定、秘密鍵、バックアップJSONを含めないでください。既存指示どおりmainの最新状態を取得し、競合や分岐があれば安全に統合して再検証します。通常の変更は追加承認なしで `git push origin HEAD:main`、そのcommitのGitHub Actions成功と公開URLを確認します。Pushが認証で失敗する場合はクラウドのGitHub連携を確認し、トークンをソースへ埋め込まないでください。

公開先: `https://komiki0401.github.io/majan_score/`。ブランチ保護や接続権限でPushできない場合、強制Pushや保護解除で回避せず、状況を報告します。
