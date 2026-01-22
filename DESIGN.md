# asaui 設計書

## 1. システム構成

### 1.1 技術スタック
- **Frontend/Backend:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Shadcn UI (Dark Mode Base)
- **Authentication:** NextAuth.js (Credentials Provider)
- **Container Orchestration:** Dockerode (Docker API wrapper)
- **Persistence:** JSON files (`/data/whitelist.json`)
- **Icons:** Lucide React

### 1.2 コンテナ構成
- **asaui:**
  - ユーザーインターフェースおよび管理APIを提供。
  - `/var/run/docker.sock` をマウントし、他コンテナを制御。
  - `/opt/arkserver` を読み取り専用マウントし、セーブデータを解析。

---

## 2. データ構造・設定

### 2.1 環境変数 (.env)
既存の ARK 設定に加え、以下の項目を `asaui` 用に使用・拡張する。

```bash
# asaui 認証設定
ASAUI_PASSWORD=your_secure_password_here

# 管理対象サーバー (既存)
ARK_SERVERS=(asa_main asa_sub1)

# 各サーバーのマップ名 (ディレクトリ解析用)
# SERVER_MAP は各サービスの environment でも定義されているが、
# asaui が .env から直接マップ名を把握するために使用。
SRV_asa_main_MAP=TheIsland_WP
SRV_asa_sub1_MAP=Extinction_WP

# セーブデータルート (デフォルト: ShooterGame/Saved/SavedArks)
ARK_SAVE_BASE_DIR=ShooterGame/Saved/SavedArks
```

### 2.2 ホワイトリスト管理 (whitelist.json)
`/data/whitelist.json` に保存。

```json
[
  {
    "eosId": "0002...",
    "name": "PlayerName",
    "note": "Optional memo",
    "addedAt": "2024-01-01T00:00:00Z"
  }
]
```

---

## 3. 機能詳細設計

### 3.1 プレイヤー所在解析ロジック
- **スキャンパス:** `/opt/arkserver/${ARK_SAVE_BASE_DIR}/${MAP_NAME}/`
- **対象ファイル:** `${EOS_ID}.arkprofile`
- **解析プロセス:**
  1. `ARK_SERVERS` で定義された各 ID に対して、対応する `SRV_${ID}_MAP` を取得。
  2. マップフォルダ内の `.arkprofile` ファイルを全走査。
  3. ファイル名から EOS ID を、最終更新日時から最終ログインを特定。
  4. 複数マップに同一 ID が存在する場合、タイムスタンプが最新のものを「現在のマップ」とし、他を「サブマップ」として表示。
  5. スキャン結果は API 経由でフロントエンドに返却し、手動リロードボタンで再実行可能。

### 3.2 サーバー制御
- **コンテナ操作:** `docker.getContainer(id).start()` / `stop()`
- **ログ取得:** `container.logs({ tail: 100, stdout: true, stderr: true })` をストリームまたは一括取得。
- **RCON操作:** 
  - `docker exec -itu arkuser ${container_id} manager rcon "${command}"` を実行。

---

## 4. UI 画面設計 (Shadcn UI)

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
- `ASAUI_PASSWORD` はハッシュ化せずとも、NextAuth で保護された API 経由でのみ検証。
- ホワイトリスト API は認証済みセッションが必須。
- Docker ソケットの露出を最小限にするため、asaui コンテナ自体への外部露出はリバースプロキシ（Basic認証等）を併用することを推奨（要求仕様通り）。
