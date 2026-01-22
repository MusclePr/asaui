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
    restart: unless-stopped
    env_file: .env
    environment:
      - ASAUI_PASSWORD=your_password
      - NEXTAUTH_SECRET=your_random_secret_string
      - NEXTAUTH_URL=http://localhost:8080
    volumes:
      - ./app:/opt/arkserver:ro
      - ./data:/data
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8080:3000"
```

`.env` に以下の設定が必要です。

```bash
ARK_SERVERS="asa_main asa_sub1"
SRV_asa_main_MAP=TheIsland_WP
SRV_asa_sub1_MAP=Extinction_WP
```

## 開発

```bash
npm install
npm run dev
```

詳細な設計については [DESIGN.md](DESIGN.md) を参照してください。
