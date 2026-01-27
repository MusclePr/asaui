# asaui - ARK Server Manager Web UI

ARK: Ascended Docker 用の専用 Web 管理 UI です。

## 特徴

- **コンテナ制御:** `asa_main`, `asa_sub1` 等のサイドコンテナを Web から開始・停止。
- **プレイヤー情報:** 各マップのセーブデータを解析し、最終ログイン日時を表示。
- **ホワイトリスト管理:** EOS ID とニックネームのペアを JSON でシンプルに管理。
- **RCON コンソール:** コンテナ内コマンド経由で RCON 操作を実行。
- **サーバー設定:** `cluster` の `default.cluster` / `.cluster.edit` を編集し、`docker compose up/down` を実行。

## セットアップ

本リポジトリは以下の2つの compose を使います。

- asaui（UI）: リポジトリルートの [compose.yml](compose.yml)
- cluster（ARKサーバ）: [cluster/compose.yml](cluster/compose.yml)

asaui から `docker compose up/down` で cluster を一括起動/停止できるため、通常は **asaui だけ** を起動します。

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

`.env` に以下の設定が必要です。

```bash
ASAUI_PASSWORD=your_password
NEXTAUTH_SECRET=your_random_secret_string
NEXTAUTH_URL=http://localhost:8080

# 管理対象コンテナ名（スペース/カンマ区切り、() で囲ってもOK）
ARK_SERVERS="asa_main asa_sub1"
SRV_asa_main_MAP=TheIsland_WP
SRV_asa_sub1_MAP=Extinction_WP

# cluster Settings
ASAUI_CLUSTER_DIR=/cluster

# CurseForge (optional)
CURSEFORGE_API_KEY=
#CURSEFORGE_API_BASE_URL=https://api.curseforge.com
```

### cluster の設定ファイル

サーバーの設定（環境変数）は、以下の3つのファイルによって管理されます。

- **[cluster/default.cluster](cluster/default.cluster)**: クラスタ全体のデフォルト設定ファイルです。Dockerイメージやタイムゾーン、ベースとなるサーバー設定（ポート番号など）を記述します。
- **[cluster/.cluster.edit](cluster/.cluster.edit)**: `asaui` の「設定」ページから編集される、ARKサーバー固有の個別設定（プレイヤー数、パスワード、MODなど）を保存するファイルです。
- **[cluster/.cluster](cluster/.cluster)**: 最終的に Docker Compose が読み込むために自動生成されるファイルです。`default.cluster` の内容に `.cluster.edit` による上書きを適用した結果が書き込まれます。直接編集する必要はありません。

補足:

- `ASAUI_CLUSTER_DIR` はコンテナ内のパスです（上の compose 例では `./cluster:/cluster` をマウント）。
- `CURSEFORGE_API_KEY` を設定すると、設定ページで MOD ID から名前/URL を解決して表示します（未設定でも動作します）。

### 参照用 external（任意）

制御対象の `ARK_Ascended_Docker` は、本リポジトリに **参照用** としてサブモジュールを配置しています（親の `compose.yml` や asaui 自体は依存しません）。

- 実行・起動は本リポジトリの `compose.yml`（asaui）と `cluster/compose.yml`（ARK）で完結します。
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
