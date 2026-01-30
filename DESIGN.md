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
  - cluster 設定: `.cluster`（上書き）、`default.cluster`（ベース）、`ALL_MODS` による高度なMOD管理
- **Icons:** Lucide React
- **Forms/Validation:** サーバー側での厳格な環境変数バリデーション（.env 破壊防止）

### 1.2 コンテナ構成
- **asaui:**
  - ユーザーインターフェースおよび管理APIを提供。
  - `/var/run/docker.sock` をマウントし、他コンテナを制御。
  - `/cluster` をマウントし、メタ情報の保持、cluster 設定（`.cluster`）の編集、および `docker compose up/down` を実行。
  - `/cluster/server` が各コンテナにマウントされるため、セーブデータ解析とサーバー側リストの直接更新を行う。

---

## 2. データ構造・設定

### 2.1 環境変数 (.env)
ARK の既存設定を `asaui` で扱う際、以下の拡張・制約を設ける。

```bash
ASAUI_PASSWORD=your_secure_password
ASAUI_SIMPLE_PASSWORD=your_simple_password
NEXT_PUBLIC_BASE_PATH=/asaui
NEXTAUTH_SECRET=YourOriginalPrivateSecretSign
# https://docs.curseforge.com/rest-api/#authentication
CURSEFORGE_API_KEY=
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

いずれも「1行=1つのEOS ID」のテキスト。ホワイトリストはサーバー再起動が必要。

#### 2.2.3 cluster 設定ファイル (階層マージ構造)
asaui は複数の設定ファイルをマージして最終的な `.env`（環境変数ファイル）を生成・提供する。

1. **クラスター設定（共通）**:
   - `default.cluster`: ベース設定（読み取り専用推奨）。
   - `.cluster`: UI からの上書き設定（`MAX_PLAYERS`, `MODS`, `ALL_MODS` 等）。
2. **インスタンス設定（個別）**:
   - `default.main`, `default.sub1`: 個別設定（マップ名等）のベース。
   - `.main`, `.sub1`: インスタンスごとの上書き設定。

※ `docker-compose` がこれらを直接 `env_file` として複数読み込み、後の記述で上書きします。

---

## 3. 機能詳細設計

### 3.1 プレイヤー所在解析ロジック
- **スキャンパス:** `${ARK_SAVE_BASE_DIR}/${MAP_NAME}/`
- **対象ファイル:** `${EOS_ID}.arkprofile`
- **解析プロセス:**
  1. `ARK_SERVERS` で定義された各 ID に対して、対応する `SRV_${ID}_MAP` を取得。
  2. マップフォルダ内の `.arkprofile` ファイルを全走査。
  3. ファイル名から EOS ID を、最終更新日時（mtime）から最終ログインを特定。
  4. 複数マップに同一 ID が存在する場合、mtime が最新のものを採用。

### 3.2 サーバー・クラスター制御
- **コンテナ操作:** `dockerode` を使用した `start` / `stop` / `restart`。
- **クラスター一括制御:** `ASAUI_CLUSTER_DIR` で `docker compose up -d` / `down` を実行。
- **設定反映:** `.cluster` 保存後、コンテナ再起動で適用（`compose.yml` が直接参照）。

### 3.3 高度な MOD 管理
- **データ分離:** `ALL_MODS` に全 ID を、`MODS` に有効な ID のみを保持。
- **UI 操作:** 並び替え（読み込み順）と有効/無効のトグル切り替え。
- **外部連携:** `CURSEFORGE_API_KEY` が設定されている場合、CurseForge API から MOD の名称と URL を自動取得。

### 3.4 バリデーション & 安全性
`.cluster` ファイルの構文を破壊しないよう、設定保存時に以下のバリデーションを実行する。
- **禁止文字:** `#`, `'`, `"`, 改行, 空白（パスワードやMOD IDなどのフィールド）。
- **型チェック:** `MAX_PLAYERS` の数値範囲（1〜100）や、MOD ID の数字形式チェック。

### 3.5 リアルタイムログ表示ロジック
- **プロトコル:** Server-Sent Events (SSE) を使用。
- **バックエンド実装:**
  - `dockerode` から取得したログストリームを SSE の `data:` 形式でクライアントへ転送。
- **フロントエンド実装:**
  - `ansi-to-html` を使用して、ANSI カラー情報を HTML 要素に変換。
  - 最大保持行数（1000行）を制御しパフォーマンスを維持。

---

## 4. UI・フロントエンド設計

### 4.1 ページ構成
- **ダッシュボード (`/`):** サーバー状況の一覧、一括操作、操作履歴ログ。
- **プレイヤー管理 (`/players`):** プレイヤー一覧、ホワイトリスト/バイパスリスト管理（セーブスキャン機能）。
- **RCON コンソール (`/rcon`):** 指定したサーバーへの RCON コマンド送信。（古い情報です。要訂正。）
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
