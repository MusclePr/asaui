# asaui 設計書

## 1. システム構成

### 1.1 技術スタック
- **Frontend/Backend:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Authentication:** NextAuth.js (Credentials Provider / Password)
- **Container Orchestration:** Dockerode (Docker API wrapper)
- **Cluster Control:** docker CLI / docker compose（コンテナ内から実行）
- **Persistence:**
  - 表示名メタ情報: JSON (`/cluster/players.json`)
  - サーバー側リスト: テキスト（ホワイトリスト/バイパスリスト）
  - cluster 設定: `.cluster.edit`（上書き）と `.cluster`（自動生成）
- **Icons:** Lucide React
- **Forms/Validation:** シンプルなフォーム + サーバー側バリデーション

### 1.2 コンテナ構成
- **asaui:**
  - ユーザーインターフェースおよび管理APIを提供。
  - `/var/run/docker.sock` をマウントし、他コンテナを制御。
  - `/cluster` をマウントし、表示名などのメタ情報を永続化および cluster の設定編集と `docker compose up/down` を行う。
  - `/cluster/server` が ARK_Ascened_Docker にマウントされるため、セーブデータ解析とサーバー側リスト更新を行う。

---

## 2. データ構造・設定

### 2.1 環境変数 (.env)
既存の ARK 設定に加え、以下の項目を `asaui` 用に使用・拡張する。

```bash
# asaui 認証設定
ASAUI_PASSWORD=your_secure_password_here
NEXTAUTH_SECRET=your_random_secret_string
NEXTAUTH_URL=http://localhost:8080

# 管理対象サーバー (既存)
ARK_SERVERS="asa_main asa_sub1"

# 各サーバーのマップ名 (ディレクトリ解析用)
# SERVER_MAP は各サービスの environment でも定義されているが、
# asaui が .env から直接マップ名を把握するために使用。
SRV_asa_main_MAP=TheIsland_WP
SRV_asa_sub1_MAP=Extinction_WP

# セーブデータルート (デフォルト: ShooterGame/Saved/SavedArks)
ARK_SAVE_BASE_DIR=/cluster/server/ShooterGame/Saved/SavedArks

# RCON 実行対象 (未指定時は ARK_SERVERS の先頭)
ARK_MAP_MAIN=asa_main

# cluster Settings
# cluster の compose / env を配置したディレクトリ（asaui コンテナ内パス）
ASAUI_CLUSTER_DIR=/cluster

# CurseForge (optional)
# MOD ID から名称/URL を引くために使用（未設定でも動作）
CURSEFORGE_API_KEY=
#CURSEFORGE_API_BASE_URL=https://api.curseforge.com
```

### 2.2 永続化データ

#### 2.2.1 表示名メタ情報 (players.json)
`/cluster/players.json` に EOS ID → 表示名のマップを保存する。

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

#### 2.2.3 cluster 設定ファイル
asaui は `ASAUI_CLUSTER_DIR` 配下のファイルを扱う。

- ベース: `default.cluster`
- 上書き: `.cluster.edit`（UI から編集。扱うキーは必要最小限に限定）
- 有効設定: `.cluster`（`default.cluster` + `.cluster.edit` をマージして自動生成）

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
  5. スキャン結果は API 経由でフロントエンドに返却し、手動リロードボタンで再実行可能（現在のUIはマップ名表示は行わず、最終ログイン日時中心）。

### 3.2 サーバー制御
- **コンテナ操作:** `docker.getContainer(id).start()` / `stop()` / `restart()`
- **ログ取得 (リアルタイム):** 
  - `dockerode` の `logs({ follow: true, stdout: true, stderr: true })` を使用。
  - Server-Sent Events (SSE) 経由でフロントエンドへストリーミング。
- **RCON操作:** 
  - 対象コンテナ内で `manager rcon <command>` を実行（Docker Exec 相当）。

### 3.3 cluster 制御
- **設定編集:** `ASAUI_CLUSTER_DIR/.cluster.edit` を編集し、`.cluster` を自動生成.
- **一括起動/停止:** `docker compose -f compose.yml up -d` / `down` を `ASAUI_CLUSTER_DIR` で実行。
  - ※ `.env` が存在する場合、compose が自動的に読み込む（変数展開用）。

### 3.4 リアルタイムログ表示ロジック
- **プロトコル:** Server-Sent Events (SSE) を使用。
- **バックエンド実装:**
  - `dockerode` から取得したログストリームを SSE の `data:` 形式でクライアントへ転送。
  - クライアントの切断を検知し、適切にストリームをクローズする。
- **フロントエンド実装:**
  - `EventSource` API を使用して接続。
  - `ansi-to-html` を使用して、ANSI カラー情報を HTML 要素に変換。
  - 最大保持行数（1000行）を制御しパフォーマンスを維持。

---

## 4. UI・フロントエンド設計

### 4.1 ページ構成
- **ダッシュボード (`/`):** サーバー状況の一覧、一括操作、操作履歴ログ。
- **プレイヤー管理 (`/players`):** プレイヤー一覧、ホワイトリスト/バイパスリスト管理（セーブスキャン機能）。
- **RCON コンソール (`/rcon`):** 指定したサーバーへの RCON コマンド送信。
- **設定 (`/cluster`):** クラスタ全体の環境変数編集。

### 4.2 ボタンの優先順位とレイアウト
ユーザーの利用頻度と不注意による事故防止を考慮し、以下の方針でコンポーネントを配置する。
- **プライマリーアクション:** 「ログ表示」ボタン。最も大きく、アクセスしやすい位置に配置。
- **セカンダリーアクション:** 「起動・停止・再起動」ボタン。アイコンのみのコンパクトな配置とし、ステータス確認を優先。
- **ステータス表示:** 状態 (RUNNING/EXITED) を色付きバッジで強調。

---

## 5. セキュリティ
- `ASAUI_PASSWORD` は NextAuth の Credentials 認証で検証（現状は平文比較）。
- ホワイトリスト API は認証済みセッションが必須。
- Docker ソケットの露出を最小限にするため、asaui コンテナ自体への外部露出はリバースプロキシ（Basic認証等）を併用することを推奨（要求仕様通り）。
