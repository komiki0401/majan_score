# Windows PCへの開発引き継ぎ

## 移行前に確認した状態

- リポジトリ: https://github.com/komiki0401/majan_score
- 開発ブランチ: `main`
- アプリコードの引き継ぎ基準: `0bc77d5`（大会の接続状態帯を全画面から削除）
- 上記コミットはGitHub mainと一致し、未コミット変更なし。GitHub Pagesのデプロイも成功。
- この手順書の追加コミット以降をクローンすれば、これまでのコードとGit履歴を引き継げる。
- Windows PCのインストール・起動・スマホとのペアリングは、PC側で実施・確認する。クラウド側で完了した扱いにはしない。

React 19 + TypeScript + Vite 6。Node.js **24.x** / npm **11.x**を使用する。
Docker、WSL、Python、Supabase CLIは、このアプリの起動には不要。

## 1. GitとNode.jsを用意する

WindowsでPowerShellを開き、順に実行する。

```powershell
git --version
node --version
npm.cmd --version
```

Gitがない場合は、以下を実行するか https://git-scm.com/downloads/win からインストールする。

```powershell
winget install --id Git.Git --exact
```

Node.jsがない、または24.xでない場合は https://nodejs.org/en/download で**24.x**のWindowsインストーラー（CPUに合うx64/ARM64）を選択する。すでに別バージョンを他のプロジェクトで使用している場合は、上書きせずバージョン管理ツールなどで24.xを併用する。

インストール後はPowerShellを閉じて開き直し、上の3コマンドを再実行する。`npm.cmd`ならPowerShellのスクリプト実行ポリシーを変更せずに使える。

## 2. Git履歴ごとクローンする

新規の保存先で、順に実行する。

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\source" | Out-Null
Set-Location "$env:USERPROFILE\source"
git clone https://github.com/komiki0401/majan_score.git
Set-Location .\majan_score
git status --short --branch
git log -1 --oneline
```

`majan_score`フォルダーがすでに存在する場合は、削除・上書きせず、その中の`git status`と`git remote -v`を確認する。今回のリポジトリで未コミット変更がなければ、`git pull --ff-only`で更新できる。変更や分岐がある場合は、先にその内容を確認する。

ZIPダウンロードではなく`git clone`を使うと、これまでのコミット履歴も引き継げる。

## 3. 依存関係と動作確認

`majan_score`フォルダー内で順に実行する。

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1
```

最後のコマンドは実行したままにし、表示されたURLをPCのブラウザで開く。通常は http://127.0.0.1:5173/ 。ポート使用中ならViteが表示する別のURLを使う。停止は`Ctrl+C`。

表示確認:

1. 最初にダッシュボードが表示される。
2. クラウド設定後は「直近の大会」と「全大会・累計」を切り替えられる。
3. 対局履歴の初期表示は全大会・全日付。日付の「集計対象」欄と大会の接続状態帯は表示しない。
4. スコア入力はメニューから開き、入力先の大会名カードが大きく表示される。
5. 開発サーバーを再起動しても、同じSupabaseの記録を閲覧できる。

既存の本番データを確認する段階では、閲覧のみでよい。保存・編集・削除のテストを同じSupabaseに接続して行うと、本番にも反映される。自動テストはローカルのテストデータ／一時DBを使用する。

## 4. 既存のSupabaseに接続する

SupabaseのデータはクラウドDBに残るため、PCへ移動・再作成する必要はない。**既存の同じプロジェクト**に接続する。今回の移行のために`setup.sql`を再実行する必要はない。

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
```

`.env.local`の2項目を既存の値へ置き換える。

```dotenv
VITE_SUPABASE_URL=https://実際のプロジェクトID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=実際のPublishableキー
```

値はSupabaseのProject URL/API Keys、またはGitHubの Settings → Secrets and variables → Actions → Variablesにある既存の2変数で確認する。コードやチャットへコピーする必要はない。

- `Secret key`、`service_role`、DBパスワードは使わない。
- `.env.local`はGit除外設定済み。確認は`git check-ignore .env.local`。
- `.env.local`を変更したら開発サーバーを再起動する。
- アプリの設定画面から同じProject URLと公開キーを設定する方法も利用できる。
- GitHub Pages側の設定変数・公開URL・自動デプロイはそのまま残る。

### 端末内の記録について

Gitで引き継げるのはコードと履歴。ブラウザのローカル保存は、GitHubにも新しいPCにも自動コピーされない。公開サイトと`localhost`でも保存領域は別。

端末内だけの記録がある場合は、元のブラウザを残したまま確認する。共有したい記録は元ブラウザの大会一覧から「公開大会としてコピー」を使える（既にコピー済みなら重複作成しない）。CSVは閲覧用で、現状アプリへ再インポートできない。ブラウザデータは移行確認が済むまで消さない。

## 5. PCでCodexを開く

最新のWindows向けChatGPTデスクトップアプリを公式案内からインストールし、同じChatGPTアカウント・ワークスペースでサインインする。

- Windows公式案内: https://developers.openai.com/codex/windows/windows-app
- プロジェクトの追加／フォルダーを開く操作で、`C:\Users\自分のユーザー名\source\majan_score`を開く。
- 実行先はローカルPC（This computer / Windows native）にする。
- 最初にREADMEとこの手順書を読ませる。

貼り付ける引き継ぎ指示の例:

```text
komiki0401/majan_score のローカル開発を引き継いでください。
README.md と docs/windows-local-development.md を読んでください。
React + TypeScript + Viteを維持し、日本語・スマホ操作を優先してください。
ログイン機能は意図的に撤廃済みです。Supabaseの公開大会を匿名で共有し、RLSと検証付きRPCを維持します。
同名参加者は全大会ランキングで合算します。対局履歴は全大会の全日付を表示します。
点数入力とウマ・オカ計算済みポイントの直接入力を維持してください。
既存データ・Git履歴・.env.localを削除せず、秘密情報を出力しないでください。
まず git status、node/npmのバージョン、npm.cmd test、npm.cmd run build を確認してください。
本番Supabaseの記録を検証のために変更しないでください。
変更は作業ブランチで行い、mainへの反映・公開は私の指示に従ってください。
```

このクラウドチャット自体が`git clone`でPCへ移るわけではない。ソース・README・この引き継ぎ指示で開発を継続できる。

CLIも使いたい場合のみ、PCで追加する（スマホ接続の設定とは別）。

```powershell
npm.cmd install -g @openai/codex
codex.cmd
```

## 6. スマホから接続済みPCのCodexに指示する

公式手順: https://developers.openai.com/codex/remote-connections

1. PC側の最新ChatGPTデスクトップアプリを開く。
2. Settings → Connections → Control this Mac or PC → Set up / Addを開く。
3. PCへのリモートアクセスを承認し、表示されたQRコードをスマホで読み取る。
4. スマホの最新ChatGPTアプリで、PCと同じアカウント・ワークスペースを確認し、必要な認証を完了する。
5. スマホのCodex（バージョンによりRemote）から、接続したWindows PCと`majan_score`のプロジェクトを選ぶ。
6. 実行先がCloudではなく、そのWindows PCであることを確認して指示する。

最初のスマホからの指示は、次のような読み取り専用確認でよい。

```text
このPCの majan_score で作業してください。
作業フォルダー、git status --short --branch、git log -1 --onelineを確認し、まだファイルは変更しないでください。
```

PCは電源・ネット接続・アプリ起動を維持し、必要なら接続設定のスリープ防止を利用する。スマホ接続のためにルーターのポート開放やViteサーバーの一般公開は不要。

iOS/Androidやアカウント・ワークスペース・段階的提供状況によって、Codex / Remoteや接続設定が表示されない場合がある。両アプリを更新し、組織アカウントでは管理者のRemote Control設定も確認する。公式のモバイル設定はデスクトップアプリから開始し、CLIをインストールしただけでは完了しない。

## 7. 今後のGit運用

新しい変更を始める前に、未保存の変更がないことを確認して更新する。

```powershell
git status
git switch main
git pull --ff-only
git switch -c feature/変更内容を表す英数字名
```

作業ブランチで編集・テストし、GitHubへpushしてPRでmainに反映できる。main更新時は既存のGitHub Actionsがテスト・ビルド・Pages公開を行う。

PCでGitHubへのpush権限が未設定なら、Gitのブラウザ認証を使うか、GitHub CLIを入れて本人のアカウントで認証する。

```powershell
winget install --id GitHub.cli --exact
# インストール後にPowerShellを開き直して実行
gh auth login
```

`git reset --hard`、`git clean -fd`、force push、Supabaseのリセットは移行に不要。
