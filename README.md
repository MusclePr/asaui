# asaui - ARK Server Manager Web UI

ARK: Ascended Docker 用の専用 Web 管理 UI です。

## 特徴

- **コンテナ制御:** `asa_main`, `asa_sub1` 等のサイドコンテナを Web から開始・停止。
- **プレイヤー位置特定:** 各マップのセーブデータを解析し、最新のログイン場所を表示。
- **ホワイトリスト管理:** EOS ID とニックネームのペアを JSON でシンプルに管理。
- **RCON コンソール:** コンテナ内コマンド経由で RCON 操作を実行。

## セットアップ

`compose.yml` にサービスを追加して利用します。

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
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8080:3000"
```

`.env` に以下の設定が必要です。

```bash
ASAUI_PASSWORD=your_password
NEXTAUTH_SECRET=your_random_secret_string
NEXTAUTH_URL=http://localhost:8080

ARK_SERVERS="asa_main asa_sub1"
SRV_asa_main_MAP=TheIsland_WP
SRV_asa_sub1_MAP=Extinction_WP
```

### 参照用サブモジュール（任意）

制御対象の `ARK_Ascended_Docker` は、本リポジトリに **参照用** としてサブモジュールを配置しています（親の `compose.yml` や asaui 自体は依存しません）。

- 実行・起動は **常に本リポジトリルートの** `compose.yml` から行い、`external/ARK_Ascended_Docker` 配下の compose は実行しません。
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
