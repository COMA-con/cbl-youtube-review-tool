# CBL YouTube Review Tool Ver1.1

Conqueror's Blade の大会練習・反省会で、最大15本のYouTube限定公開アーカイブを同時確認するための静的Webツールです。

設定担当者が動画URLと開始位置を入力して共有URLを作成し、そのURLを開いたメンバーは設定画面を経由せずレビュー画面へ直行できます。

## リーダー向け簡単手順

1. YouTube URLを貼る
2. 開始位置を入れる
3. `共有URL作成` を押す
4. コピーされたURLをDiscordなどで共有する
5. 必要なら `レビュー画面で確認` を押して、見え方を確認する

注意:

- 空欄の動画は無視されます。
- 開始位置が空欄なら `00:00` 扱いです。
- 共有URLを開くとレビュー画面に直接入ります。

## 構成

- 静的HTML/CSS/JavaScriptのみ
- YouTube IFrame Player APIを使用
- APIキーなし
- DBなし
- ログインなし
- `localStorage` は使わず、設定画面の入力途中保存に `sessionStorage` のみ使用
- GitHub Pages / Cloudflare Pages / Vercel などで公開可能

## ローカルでの起動

YouTubeエラー153を避けるため、`index.html` をダブルクリックして `file://` で開かないでください。ローカルサーバー経由で開きます。

```powershell
cd C:\codex\cbl-youtube-review-tool
python -m http.server 5173
```

ブラウザで以下を開きます。

```text
http://localhost:5173/index.html
```

または:

```text
http://127.0.0.1:5173/index.html
```

## GitHub Pagesでの公開方法

このプロジェクトは GitHub Pages の `main` ブランチ root `/` 公開を想定しています。

1. GitHubで `cbl-youtube-review-tool` リポジトリを作成します。
2. このフォルダを `main` ブランチとしてpushします。
3. GitHubのリポジトリ画面で `Settings` → `Pages` を開きます。
4. `Build and deployment` の `Source` を `Deploy from a branch` にします。
5. `Branch` は `main`、フォルダは `/ (root)` を選んで保存します。
6. 公開後、以下のURLで開きます。

```text
https://<GitHubユーザー名>.github.io/cbl-youtube-review-tool/index.html
```

GitHub Pages上では、共有URLは次のような形になります。

```text
https://<GitHubユーザー名>.github.io/cbl-youtube-review-tool/index.html#r=1~10~DUMMYVIDEOID.0
```

`DUMMYVIDEOID` は説明用のダミーです。実際の共有URLには、設定画面に入力したYouTube動画のVideo IDが入ります。

## Discord共有URLの作り方

1. 公開URLを開きます。
2. 動画1〜動画15にYouTube URLを貼ります。
3. 必要に応じて開始位置を `HH:MM:SS` または `MM:SS` で入力します。
4. `共有URL作成` を押します。
5. 共有URLが自動コピーされます。失敗した場合は `共有URLをコピー` を押します。
6. DiscordのVCテキストチャットなどへ貼ります。
7. メンバーが共有URLを開くと、レビュー画面へ直行します。

共有URLには以下だけを含めます。

- YouTube Video ID
- 開始位置
- 再生速度

共有URLには以下を含めません。

- 元のYouTube URL全文
- プレイヤー名
- メモ
- ミュート状態
- 拡大状態
- 現在の再生位置
- 一時停止状態
- 設定画面の入力途中状態

## 対応するYouTube URL

- `https://www.youtube.com/watch?v=DUMMYVIDEOID`
- `https://youtu.be/DUMMYVIDEOID`
- `https://www.youtube.com/embed/DUMMYVIDEOID`
- `https://www.youtube.com/live/DUMMYVIDEOID`
- `https://www.youtube.com/shorts/DUMMYVIDEOID`

余計なクエリパラメータが付いていても、可能な範囲でVideo IDを抽出します。

## 開始位置

対応形式:

- `HH:MM:SS`
- `MM:SS`
- 空欄は0秒

例:

- `01:23:45`
- `23:45`
- `00:01:20`
- `01:20`

Ver1.1では、秒数のみの `120` は不正形式として扱い、0秒にします。URLが有効なら共有URLには含めますが、設定画面に警告を表示します。

## 共有URL形式

```text
https://公開先URL/index.html#r=<URLエンコード済み設定データ>
```

エンコード前のpayload:

```text
1~再生速度コード~動画ID.開始秒数36進数,動画ID.開始秒数36進数
```

例:

```text
1~10~DUMMYVIDEOID.28,DUMMYVIDE02.0,DUMMYVIDE03.2s0
```

再生速度コード:

- `05` = 0.5倍
- `075` = 0.75倍
- `10` = 1.0倍
- `125` = 1.25倍
- `15` = 1.5倍
- `20` = 2.0倍

開始秒数は36進数です。

- 80秒 → `28`
- 120秒 → `3c`
- 3600秒 → `2s0`

## レビュー画面

- 共有URLに含まれる有効動画だけを表示します。
- 空欄、不正URL、非表示にした動画、destroy済み動画はレイアウト計算から除外します。
- 現在表示中の有効動画数に応じて自動レイアウトします。
- 最大は5列×3行です。
- 非表示後も残り動画数で再レイアウトします。
- 初期音声は全ミュートです。
- 音声ONにできる動画は原則1本のみです。
- 拡大した動画は音声ONになり、他の動画はミュートされます。

人数別の基本レイアウト:

- 1本: 1列×1行
- 2本: 2列×1行
- 3本: 3列×1行
- 4本: 2列×2行
- 5〜6本: 3列×2行
- 7〜9本: 3列×3行
- 10〜12本: 4列×3行
- 13〜15本: 5列×3行

## 操作

- 全再生
- 全停止
- 5秒戻す
- 5秒進める
- 30秒戻す
- 30秒進める
- 再同期
- 再生速度変更
- 全ミュート
- 設定編集
- 動画ごとの音声ON
- 動画ごとの拡大
- 動画ごとの一時非表示

## ショートカット

ショートカットは補助機能です。YouTube iframeにフォーカスがある場合は効かないことがあります。その場合は操作バーを使ってください。

- Space: 全再生 / 全停止
- ←: 5秒戻す
- →: 5秒進める
- R: 再同期
- Esc: 拡大解除

## JSON機能

JSONは詳細機能です。通常利用者は触らず、設定担当者のバックアップや後日の再編集に使います。

設定画面下部の `詳細機能` を開くと、JSON出力とJSON読み込みを使えます。

## 画質について

ツール側から画質を一括指定・強制する機能は実装しません。

YouTube IFrame Player APIでは、現在 `setPlaybackQuality` などによる画質制御は実質的に機能しません。

- 小さな画面サイズではYouTube側が自動的に低画質を選ぶ場合があります。
- 拡大時にはYouTube側が自動的に画質を上げる場合があります。
- 重い場合はYouTubeプレイヤー内の歯車アイコンから手動で画質を下げてください。

## エラー153対策

エラー153は、YouTubeにHTTP Refererまたは同等のクライアント識別情報が渡っていない場合に出ることがあります。

このツールでは以下を実装しています。

- `<meta name="referrer" content="strict-origin-when-cross-origin">`
- YouTube Player作成時に、可能な場合は `origin: window.location.origin` を指定
- `file://` 起動時の警告表示

それでも `file://` では参照元情報が渡らないことがあります。localhostまたはGitHub Pagesなどの公開URLから開いてください。広告ブロックやプライバシー系拡張機能の影響も確認してください。

## 15本同時再生の注意

15本同時再生はPCスペック、GPU、メモリ、回線、ブラウザの状態に強く依存します。

環境によっては、一部動画が黒画面になる、カクつく、読み込みが止まる可能性があります。安定運用する場合は、回線とPCが強いリーダーがツールを開き、Discordで画面共有する運用を推奨します。

重い場合は不要な動画を非表示にするか、YouTubeプレイヤー内の歯車から手動で画質を下げてください。

## セキュリティと共有時の注意

- 限定公開URLの取り扱いには注意してください。
- このリポジトリに実在の限定公開URLやVideo IDをコミットしないでください。
- 共有URLにはVideo IDが含まれるため、Discordで共有する相手を限定してください。
- APIキー、トークン、個人情報は不要です。

## Ver2以降の候補

- リーダー操作のリアルタイム同期
- 部屋URLまたはセッションID
- メモ機能
- 複数試合の保存管理
- 非表示動画の復帰UI
