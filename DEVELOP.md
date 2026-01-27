# DEVELOP.md — asaui 開発要求仕様書

## 1. プロジェクト概要

**目的:**  
`ARK_Ascended_Docker` ベースの ARK サーバー群（`asa_main`, `asa_sub1` など）を制御・可視化する専用 Web UI「asaui」を開発する。asaui は Docker コンテナとして提供され、UI 自体はリポジトリルートの `compose.yml`（asaui）で起動し、ARK サーバーは `cluster/compose.yml` を別 compose として運用する。

asaui は以下を提供する:

- Docker API（`/var/run/docker.sock`）経由で、`ARK_SERVERS` に一致するコンテナの状態表示・start/stop/restart
- `ASAUI_CLUSTER_DIR` 配下の compose/env を利用した、`docker compose up/down` による cluster の一括起動/停止
- cluster の env 上書き（`.cluster.edit`）と `.cluster` 自動生成
- **高度なMOD管理:** `ALL_MODS` 変数を活用した、UI 上での有効/無効および並び替え機能

**対象リポジトリ:**

- 本プロジェクト：`https://github.com/MusclePr/asaui`
- ARK_Ascended_Docker プロジェクト: `https://github.com/MusclePr/ARK_Ascended_Docker`

※ ARK_Ascended_Docker は本リポジトリに参照用サブモジュールとして配置できるが、**親の compose.yml と asaui の実行はサブモジュールに依存しない**（参照専用）。

**参考ファイル:**

- 環境変数 `.env` ファイル:

```bash
# Docker Image Settings
# Change User and Group ID to the owner of the files (docker compose build required to take effect)
#PGID=1000
#PUID=1000

# Basic server config
TZ=Asia/Tokyo
DOMAIN=TEST
MAX_PLAYERS=10
# Backup Settings
#AUTO_BACKUP_ENABLED=false
#AUTO_BACKUP_CRON_EXPRESSION="0 0 * * *"
#OLD_BACKUP_DAYS=7

# Healthcheck Settings
#HEALTHCHECK_SELFHEALING_ENABLED=false

# Update Settings
AUTO_UPDATE_ENABLED=false
#AUTO_UPDATE_CRON_EXPRESSION="0 * * * *"
#UPDATE_WARN_MINUTES=30

# Discord Notifications
#DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/XXXXXX/YYYYYYYYYYYYYYYYYYYYYY/

# Comment to disable password
SERVER_PASSWORD=
ARK_ADMIN_PASSWORD=*********

# Comment to disable RCON
# If you disable RCON, the builtin manager won't work
RCON_PORT=32330

# Multihome IP
#MULTIHOME=0.0.0.0

# Server IP (adds -ServerIP=<IP>)
#SERVER_IP=ark.a-b-c-d.com

# Comment to enable BattlEye
DISABLE_BATTLEYE=1

# Mods: Please provide a comma seperated list of the curse-forge modIDs and uncomment the MODS arg
# e.g. MODS=931872,931338
MODS=929800,929420,935408,928793,933975,929578,930494,933447,941697,935528,936145
# ALL_MODS: Registered mod IDs for UI management (including disabled ones)
ALL_MODS=929800,929420,935408,928793,933975,929578,930494,933447,941697,935528,936145

# Cluster Settings
CLUSTER_ID=MyCluster

# Enable ServerGameLog
SERVERGAMELOG=true

# Extra arguments
# see https://ark.wiki.gg/wiki/Server_configuration
ARK_EXTRA_OPTS=
# CustomDynamicConfigUrl="config/dynamicconfig.ini"
ARK_EXTRA_DASH_OPTS="-exclusivejoin -ForceAllowCaveFlyers -ForceRespawnDinos -AllowRaidDinoFeeding=true -ServerPlatform=ALL -RedownloadModsOnServerRestart"
# -UseDynamicConfig

ARK_SERVERS="asa_main asa_sub1"
```

- compose 構成: `compose.yml` ファイル（本リポジトリの現行例）:

```yaml
services:
  asaui:
    container_name: asaui
    image: ghcr.io/musclepr/asaui:latest
    build:
      context: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./cluster:/cluster
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8080:3000"
```

ARK サーバー群は [cluster/compose.yml](cluster/compose.yml) で運用し、asaui から一括 `up/down` を実行する。

---

## 2. コンテナ構成と asaui サービス

### 2.1 既存サービス概要

既存の ARK サーバー群（`asa_main`, `asa_sub1` など）は、cluster 側の compose（[cluster/compose.yml](cluster/compose.yml)）に定義される。

- **asa_main**
  - **image:** `ghcr.io/musclepr/ark_ascended_docker:latest`
  - **container_name:** `asa_main`
  - **volumes:** `./cluster/server:/cluster/server`, `./cluster/backups:/var/backups`
  - **ports:** `7790:7790/udp`, `27030:27030/udp`
- **asa_sub1**
  - **image:** `ghcr.io/musclepr/ark_ascended_docker:latest` ... 共通
  - **container_name:** `asa_sub1`
  - **volumes:** `./cluster/server:/cluster/server`, `./cluster/backups:/var/backups:ro` ... backup は、asa_main 任せのため、read only とされている。
  - **ports:** `7791:7791/udp`, `27031:27031/udp`

### 2.2 asaui サービス追加要件

`compose.yml` に、以下の要件を満たす `asaui` サービスを追加することを前提とする。

- **サービス名:** `asaui`
- **イメージ:** `ghcr.io/musclepr/asaui:latest`
- **コンテナ名:** `asaui`（推奨）
- **依存関係:**
  - `depends_on` に `asa_main`, `asa_sub1` を指定しない。これらのサイドコンテナの start/stop 自体を制御するため。
- **起動点:**
  - 運用・起動は常に本リポジトリルートの `compose.yml` を使用する（参照用サブモジュール側の compose は使用しない）。
- **ボリューム:**
  - `./cluster/server:/cluster/server`（セーブデータ参照およびサーバー側リストファイル更新のため）
  - `./cluster:/data`（表示名などのメタ情報を JSON で永続化）
  - `./cluster:/cluster`（cluster の env 編集・compose up/down のため）
  - `/var/run/docker.sock:/var/run/docker.sock` ホストの docker コマンドと同等に扱えるようにするため。
- **環境変数**
  - `.env` を使用する。`ARK_SERVERS` から制御対象コンテナを決定し、`SRV_<id>_MAP` で各コンテナに対応するマップ名を与える。
  - 認証用に `ASAUI_PASSWORD` と `NEXTAUTH_SECRET` を必須とする。
  - `ASAUI_CLUSTER_DIR`（デフォルト: `/cluster`）を指定可能。
- **ネットワーク:**
  - 既存サービスと同一ネットワーク（デフォルトブリッジで問題なければそれを利用）
- **ポート:**
  - 開発時はホストに公開（例: `8080:3000` など）
  - 本番運用では、別 Web サーバーからのリバースプロキシを前提とし、asaui 自身は内部ポートのみ公開でもよい（開発時は考慮不要）

---

## 3. 機能要件

### 3.1 Web UI 全体要件

- **モダンな Web UI:**
  - SPA または SSR/CSR ハイブリッド構成を想定（例: Next.js, React, Vue など）
  - レスポンシブデザイン（PC 前提だが、モバイルでも最低限崩れないこと）
  - **UI 設計方針:** 頻繁に使用する「ログ表示」ボタンを大きく配置し、誤操作を防ぎたい「起動・停止・再起動」ボタンはアイコンのみのコンパクトな配置とする。
- **フレームワーク:**
  - 特に指定なし。Node.js/Next.js を想定した設計とするが、要件を満たせば他でも可。
- **認証・保護:**
  - `.htaccess` 等によるベーシック認証などで保護される前提。
  - asaui 自身もアプリ内ログイン（パスワード）を持ち、未ログイン時は `/login` に誘導する。

### 3.2 プレイヤーホワイトリスト管理

**機能:**

1. **ホワイトリスト一覧表示**
   - プレイヤーごとに以下を表示:
     - **EOS ID**（一意な識別子）
     - **任意名（ニックネーム）**
  - **最終ログイン日時**（後述のセーブディレクトリ解析に基づく）
2. **プレイヤー追加**
   - 入力項目:
     - EOS ID（必須）
     - 任意名（任意だが入力推奨）
   - バリデーション:
     - EOS ID の形式チェック（文字数・文字種など、仕様が分かる範囲で実装）
     - 重複 EOS ID の登録禁止
3. **プレイヤー削除**
   - 対象プレイヤーを選択し、削除確認ダイアログを表示してから実行。
4. **データ永続化**
  - 表示名などのメタ情報は `/cluster/players.json` に保存する。
  - ホワイトリスト/バイパスリストは ARK サーバー側のリストファイル（`ShooterGame/Binaries/Win64/*.txt`）に反映する。

### 3.3 EOS ID とセーブデータ・マップの紐付け

**目的:**  
EOS ID から成るプレイヤーのセーブデータがどのセーブディレクトリに存在するかを解析し、そのディレクトリに対応するマップ名を Web UI 上に表示する。

**前提:**

- `asa_main`, `asa_sub1` などのゲームサーバーコンテナは、`./cluster/server:/cluster/server` をマウントしている。
- asaui も同じボリュームを読み取り専用でマウントし、セーブデータを参照できるようにする。

**要件:**

- **ディレクトリスキャン:**
  - `ARK_SAVE_BASE_DIR`（デフォルト: `/cluster/server/ShooterGame/Saved/SavedArks`）配下のマップディレクトリを走査し、`${EOS_ID}.arkprofile` から最終ログインを推定する。
  - マップ名とディレクトリパスの対応は、設定ファイル等でマッピング可能にしておく（例: `TheIsland_WP`, `Extinction_WP` など）。
- **UI 表示:**
  - 現状は「最終ログイン日時」を中心に表示し、マップ一覧の表示は将来拡張とする。
- **更新タイミング:**
  - 手動更新ボタン（「再スキャン」）を用意。
  - 可能であれば一定間隔でバックグラウンド更新（ポーリング）も検討。

### 3.4 サイドコンテナステータス表示

**対象コンテナ:**

- `asa_main`
- `asa_sub1`
- 将来的に `asa_sub2` などが追加される可能性はあるが、compose.yml に静的に定義されたもののみを扱う。

**要件:**

- **ステータス情報:**
  - 起動状態（running / stopped / restarting など）
  - コンテナ名
  - イメージ名
  - 稼働時間（取得可能であれば）
- **取得方法:**
  - `/var/run/docker.sock` を通じて Docker API（dockerode）で取得する。

### 3.5 サイドコンテナ制御（start/stop/restart）

**要件:**

- **操作対象:**
  - `asa_main`, `asa_sub1` など、compose.yml に静的定義されたコンテナ。
- **提供操作:**
  - `start`
  - `stop`
  - `restart`
- **制約:**
  - コンテナの増減は動的には扱わない（compose.yml を手動で編集・再起動する運用のため）。
  - UI 上でも「コンテナ追加/削除」機能は提供しない。

**実装方針:**

- Docker API（dockerode）で `start/stop/restart` を実行する。

### 3.6 リアルタイムログストリーミング

**要件:**

- 各コンテナのログを Web UI 上でリアルタイムに閲覧可能にする。
- **取得方法:**
  - `/var/run/docker.sock` を通じて Docker API の `logs` ストリームを取得。
  - バックエンドからフロントエンドへは Server-Sent Events (SSE) を使用して配信。
- **UI 表示:**
  - モーダルまたは専用エリアで表示。
  - ANSI カラーコードのパースに対応し、ターミナルに近い見栄えを提供する。
  - 自動スクロールおよび手動クリア機能の提供。

---

## 4. サーバー制御・RCON 操作

### 4.1 サイドコンテナ制御コマンド

**要件:**

- UI から start/stop/restart を実行可能にする。

### 4.2 RCON 操作

- 対象コンテナ内で `manager rcon <command>` を Docker Exec 相当で実行する。
- 実行対象は `ARK_MAP_MAIN`（未指定時は `ARK_SERVERS` の先頭）とする。
- 任意コマンド送信フォームと結果表示を提供する。

---

## 5. セキュリティ・運用要件

### 5.1 認証・アクセス制御

- `.htaccess` による保護前提

- 必要に応じてアプリ内認証を追加可能

### 5.2 リバースプロキシ前提

- 本番は Web サーバーのサブパスに配置される想定

- 開発時はルート `/` で問題なし

---

## 6. 開発環境・ビルド要件

### 6.1 開発環境

- 言語: JavaScript / TypeScript

- ランタイム: Node.js LTS

- 推奨フレームワーク: Next.js

### 6.2 ビルド・デプロイ

- Docker イメージとしてビルド

- `ghcr.io/musclepr/asaui:latest` として配布

- マルチステージビルド推奨

### 6.3 ログ・エラーハンドリング

- UI はユーザー向けに分かりやすく

- バックエンドはログを記録

- Docker コマンド失敗時はエラー表示

---

## 7. 非機能要件

- パフォーマンス: スムーズな操作性

- 拡張性: compose.yml に追加されたコンテナに対応可能

- 保守性: モジュール化、設定ファイル化

## 8. 想定ディレクトリ構成

```
asaui/
  ├─ cluster/server/     # ARK サーバーデータ永続化（compose.yml で /cluster/server にマウント）
  ├─ cluster/backups/     # バックアップ格納（asa_main が rw、asa_sub1 は restore-only で ro）
  ├─ cluster/    # ARK サーバー群の compose / env（asaui から一括 up/down・設定編集）
  ├─ cluster/         # asaui 永続化データ（/data）
  ├─ external/
  │   └─ ARK_Ascended_Docker/  # 参照用サブモジュール（任意・実行しない）
  ├─ src/
  │   ├─ app/        # Next.js App Router (pages + API routes)
  │   ├─ components/
  │   └─ lib/
  ├─ Dockerfile
  ├─ package.json
  ├─ README.md
  └─ DEVELOP.md
```

---

## 9. 今後の拡張アイデア

- プレイヤー詳細情報

- バックアップ管理 UI

- サーバー設定編集 UI

- 通知機能

---

以上を、本プロジェクトにおける asaui 開発の要求仕様とする。
