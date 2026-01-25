# asaui 設計書

## 1. システム構成

### 1.1 技術スタック
- **Frontend/Backend:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Authentication:** NextAuth.js (Credentials Provider / Password)
- **Container Orchestration:** Dockerode (Docker API wrapper)
- **Persistence:**
  - 表示名メタ情報: JSON (`/data/players.json`)
  - サーバー側リスト: テキスト（ホワイトリスト/バイパスリスト）
- **Icons:** Lucide React
- **Forms/Validation:** react-hook-form + zod

### 1.2 コンテナ構成
- **asaui:**
  - ユーザーインターフェースおよび管理APIを提供。
  - `/var/run/docker.sock` をマウントし、他コンテナを制御。
  - `/opt/arkserver` をマウントし、セーブデータ解析とサーバー側リスト更新を行う。
  - `/data` をマウントし、表示名などのメタ情報を永続化する。

---

## 2. データ構造・設定

### 2.1 環境変数 (.env)
既存の ARK 設定に加え、以下の項目を `asaui` 用に使用・拡張する。

```bash
# asaui 認証設定
ASAUI_PASSWORD=your_secure_password_here
NEXTAUTH_SECRET=your_random_secret_string

# 管理対象サーバー (既存)
ARK_SERVERS="asa_main asa_sub1"

# 各サーバーのマップ名 (ディレクトリ解析用)
# SERVER_MAP は各サービスの environment でも定義されているが、
# asaui が .env から直接マップ名を把握するために使用。
SRV_asa_main_MAP=TheIsland_WP
SRV_asa_sub1_MAP=Extinction_WP

# セーブデータルート (デフォルト: ShooterGame/Saved/SavedArks)
ARK_SAVE_BASE_DIR=/opt/arkserver/ShooterGame/Saved/SavedArks

# RCON 実行対象 (未指定時は ARK_SERVERS の先頭)
ARK_MAP_MAIN=asa_main
```

### 2.2 永続化データ

#### 2.2.1 表示名メタ情報 (players.json)
`/data/players.json` に EOS ID → 表示名のマップを保存する。

```json
{
  "00023e876b964cd3b6f01a9d7040d038": {
    "displayName": "PlayerName"
  }
}
```

#### 2.2.2 ホワイトリスト/バイパスリスト
ARK: Ascended のサーバー側リストファイルを直接編集する。

- ホワイトリスト: `ShooterGame/Binaries/Win64/PlayersExclusiveJoinList.txt`
- バイパスリスト: `ShooterGame/Binaries/Win64/PlayersJoinNoCheckList.txt`

いずれも「1行=1つのEOS ID」のテキスト。ホワイトリストはサーバー再起動が必要になる。

---

## 3. 機能詳細設計

### 3.1 プレイヤー所在解析ロジック
- **スキャンパス:** `${ARK_SAVE_BASE_DIR}/${MAP_NAME}/`
- **対象ファイル:** `${EOS_ID}.arkprofile`
- **解析プロセス:**
  1. `ARK_SERVERS` で定義された各 ID に対して、対応する `SRV_${ID}_MAP` を取得。
  2. マップフォルダ内の `.arkprofile` ファイルを全走査。
  3. ファイル名から EOS ID を、最終更新日時（mtime）から最終ログインを特定。
  4. 複数マップに同一 ID が存在する場合、mtime が最新のものを採用（現状は「検出マップ一覧」の保持は行わない）。
  5. スキャン結果は API 経由でフロントエンドに返却し、手動リロードボタンで再実行可能。

### 3.2 サーバー制御
- **コンテナ操作:** `docker.getContainer(id).start()` / `stop()`
- **ログ取得:** （未実装/将来）`container.logs({ tail: 100, stdout: true, stderr: true })` 等で取得可能。
- **RCON操作:** 
  - 対象コンテナ内で `manager rcon <command>` を実行（Docker Exec 相当）。

---

## 4. UI 画面設計

### 4.1 ログイン画面
- `ASAUI_PASSWORD` によるシンプルなパスワード認証。

### 4.2 ダッシュボード
- サーバー一覧カード
  - コンテナ名、ステータス（稼働/停止/再起動中）、マップ名、稼働時間。
  - Start/Stop ボタン。
  - 簡易ログビューア（モーダルまたは展開パネル）。

### 4.3 プレイヤー/ホワイトリスト管理
- プレイヤー一覧テーブル
  - 任意名、EOS ID、現在のマップ（バッジ）、全検出マップ、最終ログイン日時。
  - 削除ボタン。
- ホワイトリスト追加フォーム（EOS ID, 名前）。
- 「セーブスキャン実行」ボタン。

### 4.4 RCON コンソール
- サーバー選択セレクトボックス。
- コマンド入力フォーム + 履歴/プリセットボタン（Broadcast, SaveWorld等）。
- 実行結果出力エリア。

---

## 5. セキュリティ
- `ASAUI_PASSWORD` は NextAuth の Credentials 認証で検証（現状は平文比較）。
- ホワイトリスト API は認証済みセッションが必須。
- Docker ソケットの露出を最小限にするため、asaui コンテナ自体への外部露出はリバースプロキシ（Basic認証等）を併用することを推奨（要求仕様通り）。
