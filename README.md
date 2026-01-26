# asaui - ARK Server Manager Web UI

ARK: Ascended Docker 用の専用 Web 管理 UI です。

## 特徴

- **コンテナ制御:** `asa_main`, `asa_sub1` 等のサイドコンテナを Web から開始・停止。
- **プレイヤー情報:** 各マップのセーブデータを解析し、最終ログイン日時を表示。
- **ホワイトリスト管理:** EOS ID とニックネームのペアを JSON でシンプルに管理。
- **RCON コンソール:** コンテナ内コマンド経由で RCON 操作を実行。
- **サーバー設定:** `asa_cluster` の `.env` / `envfile` を編集し、`docker compose up/down` を実行。

## セットアップ

本リポジトリは以下の2つの compose を使います。

- asaui（UI）: リポジトリルートの [compose.yml](compose.yml)
- asa_cluster（ARKサーバ）: [asa_cluster/compose.yml](asa_cluster/compose.yml)

asaui から `docker compose up/down` で asa_cluster を一括起動/停止できるため、通常は **asaui だけ** を起動します。

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
      - ./asa_server:/opt/arkserver
      - ./asa_ui:/data
      - ./asa_cluster:/asa_cluster
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8080:3000"
```

`.env` に以下の設定が必要です。

```bash
ASAUI_PASSWORD=your_password
NEXTAUTH_SECRET=your_random_secret_string
NEXTAUTH_URL=http://localhost:8080

# 管理対象コンテナ名（スペース/カンマ区切り、() で囲ってもOK）
ARK_SERVERS="asa_main asa_sub1"
SRV_asa_main_MAP=TheIsland_WP
SRV_asa_sub1_MAP=Extinction_WP

# asa_cluster Settings
ASAUI_CLUSTER_DIR=/asa_cluster

# CurseForge (optional)
CURSEFORGE_API_KEY=
#CURSEFORGE_API_BASE_URL=https://api.curseforge.com
```

### asa_cluster の env ファイル

- デフォルト: [asa_cluster/.env.sample](asa_cluster/.env.sample) を [asa_cluster/.env](asa_cluster/.env) にコピーして使用します（git管理外）。
- 上書き: asaui の「設定」ページから [asa_cluster/envfile](asa_cluster/envfile) を編集し、[asa_cluster/.env.effective](asa_cluster/.env.effective) を自動生成します（いずれもgit管理外）。

補足:

- `ASAUI_CLUSTER_DIR` はコンテナ内のパスです（上の compose 例では `./asa_cluster:/asa_cluster` をマウント）。
- `CURSEFORGE_API_KEY` を設定すると、設定ページで MOD ID から名前/URL を解決して表示します（未設定でも動作します）。

### 参照用 external（任意）

制御対象の `ARK_Ascended_Docker` は、本リポジトリに **参照用** としてサブモジュールを配置しています（親の `compose.yml` や asaui 自体は依存しません）。

- 実行・起動は本リポジトリの `compose.yml`（asaui）と `asa_cluster/compose.yml`（ARK）で完結します。
- サブモジュールは未取得でも asaui の開発・運用は可能です。

任意で取得する場合:

```bash
git clone --recurse-submodules <this-repo>
# または
git submodule update --init --recursive
```

## 開発

```bash
npm install
npm run dev
```

詳細な設計については [DESIGN.md](DESIGN.md) を参照してください。
