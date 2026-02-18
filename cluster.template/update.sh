#!/bin/bash

set -e

# このスクリプトは、cluster.template ディレクトリ内にある前提で動作します。常にこのディレクトリ内で実行されるようにします。
cd "$(dirname "$0")"

# cluster ディレクトリが既に存在していれば、その設定を引き継ぎ、最新の構成に更新します
# 最新の構成は cluster.template ディレクトリにあります。

# 常にシステムで固定の内容となり、上書きするだけで更新できるファイル
SYSTEM_FILES=(
    common.yml
    compose.yml
    defaults/template.env
    defaults/common.env
)

CLUSTER_DIR="../cluster"

# ../cluster ディレクトリが存在しない場合は、テンプレートからコピーして作成します
if [ ! -d "$CLUSTER_DIR" ]; then
    echo "Creating cluster directory from template..."
    cp -avr . "$CLUSTER_DIR" --exclude=update.sh
else
    echo "Updating existing cluster directory with latest template files..."
    mkdir -p "$CLUSTER_DIR/defaults"
    # システムファイルは常にテンプレートからコピーして上書きします
    for file in "${SYSTEM_FILES[@]}"; do
        echo "Updating $file..."
        cp -av "$file" "$CLUSTER_DIR/$file"
    done
fi

function update_user_file() {
    local src="$1"
    local dst="$2"
    if [ -f "$dst" ]; then
        echo "Updating $dst with latest template values..."
        # まずは既存のファイルから、キーと値のペアを抽出して、キャッシュします。
        declare -A existing_values
        while IFS= read -r line; do
            if [[ $line =~ ^([A-Za-z0-9_]+)=(.*)$ ]]; then
                key="${BASH_REMATCH[1]}"
                value="${BASH_REMATCH[2]}"
                existing_values["$key"]="$value"
            fi
        done < "$dst"
        # テンプレートのファイルのレイアウトに沿って、既存のファイルを更新します。
        truncate -s 0 "$dst"
        while IFS= read -r line; do
            if [[ $line =~ ^([A-Za-z0-9_]+)=(.*)$ ]]; then
                key="${BASH_REMATCH[1]}"
                value="${BASH_REMATCH[2]}"
                # キャッシュに同じキーがあれば、その行を置き換えます（空値でも存在を認識）
                if [[ -v "existing_values[$key]" ]]; then
                    echo "$key=${existing_values[$key]}" >> "$dst"
                    echo "  $key=${existing_values[$key]}"
                    # キャッシュから使用したキーを削除して、後で追加されていないキーを検出できるようにします
                    unset existing_values["$key"]
                else
                    # キーが存在しない場合は、テンプレートの値をそのまま使用します
                    echo "$key=$value" >> "$dst"
                fi
            else
                # キーと値のペアでない行は、そのままテンプレートの内容をコピーします
                echo "$line" >> "$dst"
            fi
        done < "$src"
        # キャッシュに残っているキーは、既存のファイルに存在していて、テンプレートには存在しないキーなので、ファイルの最後に追加します
        for key in "${!existing_values[@]}"; do
            echo "$key=${existing_values[$key]}" >> "$dst"
            echo "+ $key=${existing_values[$key]}"
        done
    else
        echo "No existing $dst found. Copying template $src..."
        mkdir -p "$(dirname "$dst")"
        cp -avr "$src" "$dst"
    fi
}

function add_asa_section() {
    local file="$1"
    local no="$2"

    cat <<EOF >> "$file"

  asa${no}:
    extends:
      file: common.yml
      service: asa
    container_name: asa${no}
    ports:
      - "\${ASA${no}_SERVER_PORT}:\${ASA${no}_SERVER_PORT}/udp"
      - "\${ASA${no}_QUERY_PORT}:\${ASA${no}_QUERY_PORT}/udp"
    environment:
      - "SERVER_MAP=\${ASA${no}_SERVER_MAP}"
      - "SESSION_NAME=\${ASA_SESSION_PREFIX}\${ASA${no}_SESSION_NAME}"
      - "SERVER_PORT=\${ASA${no}_SERVER_PORT}"
      - "QUERY_PORT=\${ASA${no}_QUERY_PORT}"
      - "DISCORD_WEBHOOK_URL=\${ASA${no}_DISCORD_WEBHOOK_URL:-\${ASA_DISCORD_WEBHOOK_URL}}"
      - "LOG_FILE=ShooterGame_asa${no}.log" # Avoid log file conflicts
EOF
}

# ユーザーによって変更されている可能性があるファイル
#    ../cluster/.env <--- defaults/template.env から更新します
#    ../cluster/common.env <--- defaults/common.env から更新します
#    ../cluster/web/dynamicconfig.ini <--- web/dynamicconfig.ini から更新します

update_user_file "defaults/template.env" "$CLUSTER_DIR/.env"
update_user_file "defaults/common.env" "$CLUSTER_DIR/common.env"
update_user_file "web/dynamicconfig.ini" "$CLUSTER_DIR/web/dynamicconfig.ini"

# ファイルが無ければ作成します
if [ ! -f "$CLUSTER_DIR/.env" ]; then
    echo "Creating empty .env file..."
    cp -av "defaults/template.env" "$CLUSTER_DIR/.env"
fi

if [ ! -f "$CLUSTER_DIR/common.env" ]; then
    echo "Creating empty common.env file..."
    cp -av "defaults/common.env" "$CLUSTER_DIR/common.env"
fi

# マップの数は、$CLUSTER_DIR/.env ファイルの ASA0_SERVER_MAP から ASA9_SERVER_MAP までの変数の有効な定義の有無で決まります
echo "services:" > "$CLUSTER_DIR/compose.override.yml"
for i in {1..9}; do
    # ^ASA${i}_SERVER_MAP=\w+ で始まる行が $CLUSTER_DIR/.env ファイルに存在すれば、そのマップは有効とみなします
    if grep -qE "^ASA${i}_SERVER_MAP=[[:alnum:]_]+" "$CLUSTER_DIR/.env"; then
        add_asa_section "$CLUSTER_DIR/compose.override.yml" "$i"
    fi
done
