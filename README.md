# asaui - ARK Server Manager Web UI

ARK: Ascended Docker 用の専用 Web 管理 UI です。

## 特徴

- **Docker compose 制御:** ARK_Ascended_Docker イメージを扱う compose.yml を提供し、Web から各種サービスを制御します。
- **リアルタイムログ:** 各コンテナの標準出力を ANSI カラー付きでリアルタイムに表示。
- **MOD管理:** CurseForge と連携し、MODの有効化/無効化、読み込み順序の並び替え、IDからの名称/URL解決をサポート。
- **プレイヤー情報:** 各マップのセーブデータを解析し、最終ログイン日時を表示。
- **ホワイトリスト管理:** EOS ID とニックネームのペアを JSON でシンプルに管理。
- **RCON コンソール:** コンテナ内コマンド経由で RCON 操作を実行。
- **サーバー設定:** クラスター共通設定（`common.env`）を UI から安全に編集。

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
      args:
        NEXT_PUBLIC_BASE_PATH: ${NEXT_PUBLIC_BASE_PATH:-/asaui}
    restart: unless-stopped
    env_file: .env
    environment:
      - "TZ=Asia/Tokyo"
      - "PUID=1000"
      - "PGID=1000"
      - "DOCKER_GID=999"
      - "NEXTAUTH_URL=http://localhost:8080${NEXT_PUBLIC_BASE_PATH:-/asaui}"
    volumes:
      - ./cluster:/cluster
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8080:3000"

```

`.env` に以下の設定が必要です。

```bash
ASAUI_PASSWORD=your_secure_password
ASAUI_SIMPLE_PASSWORD=your_simple_password
NEXT_PUBLIC_BASE_PATH=/asaui
NEXTAUTH_SECRET=YourOriginalPrivateSecretSign
# https://docs.curseforge.com/rest-api/#authentication
CURSEFORGE_API_KEY=
```

.env ファイルを作成したら、NEXTAUTH_SECRET を生成しておきましょう。
```bash
sed -E "s/^NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET=$(openssl rand -base64 32)/" -i .env
```

### cluster の設定ファイル

サーバーの設定（環境変数）は、以下のファイル群によって管理されます。

編集可能なファイル：
- **[cluster/common.env](cluster/common.env)**: `asaui` の UI から編集・保存される上書き設定。
- **[cluster/.env](cluster/.env)**: マップ名やセッション名などの設定を記述する環境変数ファイル。
- **[cluster/web/dynamicconfig.ini](cluster/web/dynamicconfig.ini)**: ダイナミック構成ファイル。

初期値：
- **[cluster.template/defaults/common.env](cluster.template/defaults/common.env)**: クラスタ全体のベース設定（タイムゾーン、RCONポート等）のデフォルト値。
- **[cluster.template/defaults/template.env](cluster.template/defaults/template.env)**: マップ名やセッション名などの設定を記述する環境変数ファイルのテンプレート。
- **[cluster.template/web/dynamicconfig.ini](cluster.template/web/dynamicconfig.ini)**: ダイナミック構成ファイルのテンプレート。

- cluster/compose.yml + cluster/compose.override.yml: サーバーコンテナ群の定義ファイル

補足:
- `ASAUI_CLUSTER_DIR` はコンテナ内のパスです（上の compose 例では `./cluster:/cluster` をマウント）。
- `ALL_MODS` 環境変数: `asaui` は登録されているすべての MOD ID を `ALL_MODS` で管理し、そのうち有効化されたものだけを `MODS` として構成します。

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
