#!/usr/bin/env bash
# Prueba real del contenedor con PostgreSQL y dos buckets sintéticos aislados; nunca carga .env.
set -euo pipefail
umask 077

repository=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
temporary=$(mktemp -d)
task="casa-backup-test-$$"
image="$task:local"
network="$task"
containers=("$task-db" "$task-media" "$task-r2")
cleanup() {
  local result=$?
  trap - EXIT
  docker rm -fv "${containers[@]}" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
  rm -rf "$temporary"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() {
  printf 'FALLO: %s\n' "$1" >&2
  exit 1
}
run_box() {
  docker run --rm --network "$network" --user "$(id -u):$(id -g)" \
    --volume "$temporary:/test" --workdir /test --env RCLONE_CONFIG=/test/rclone.conf --env PGUSER=backup \
    --env RCLONE_RETRIES=1 --env RCLONE_LOW_LEVEL_RETRIES=1 \
    --entrypoint "$1" "$image" "${@:2}"
}
sql() {
  docker exec "$task-db" psql -X -U backup -d app -At -v ON_ERROR_STOP=1 -c "$1"
}
backup_env=(
  --env PGUSER=backup
  --env DATABASE_URL=postgresql://backup:synthetic-backup-only@db:5432/app
  --env S3_ENDPOINT=http://media:3900 --env S3_REGION=garage --env S3_BUCKET=media
  --env S3_ACCESS_KEY_ID=GK0c1a5ad191ta1de5a2r0110000dev0
  --env S3_SECRET_ACCESS_KEY=9b3f0e6d2c1a4f8e7d6c5b4a3928170f6e5d4c3b2a190807f6e5d4c3b2a19080
  --env S3_FORCE_PATH_STYLE=true --env R2_ENDPOINT=http://r2:3900 --env R2_REGION=garage
  --env R2_BUCKET=backups --env R2_ACCESS_KEY_ID=GK0c1a5ad191ta1de5a2r0110000dev0
  --env R2_SECRET_ACCESS_KEY=9b3f0e6d2c1a4f8e7d6c5b4a3928170f6e5d4c3b2a190807f6e5d4c3b2a19080
  --env RCLONE_RETRIES=1 --env RCLONE_LOW_LEVEL_RETRIES=1 --env RCLONE_RETRIES_SLEEP=0ms
)
run_backup() {
  docker run --rm --network "$network" --user "$(id -u):$(id -g)" \
    --volume "$temporary:/test" "${backup_env[@]}" --env "AGE_RECIPIENT=$recipient" \
    "$@" "$image"
}
list_backups() {
  run_box rclone lsf r2:backups/casa-digital --files-only --max-depth 1 \
    | LC_ALL=C sort | sed -n '/^[0-9]\{8\}T[0-9]\{6\}Z-[0-9a-f]\{16\}\.tar\.zst\.age$/p'
}
assert_failure() {
  local label=$1
  shift
  sql "UPDATE app_config SET value = '\"2000-01-01T00:00:00Z\"'::jsonb WHERE key='backup.lastRunAt'" >/dev/null
  list_backups > "$temporary/before"
  if run_backup "$@" > "$temporary/failure.log" 2>&1; then
    fail "$label debía terminar con error"
  fi
  [[ "$(sql "SELECT value #>> '{}' FROM app_config WHERE key='backup.lastRunAt'")" == 2000-01-01T00:00:00Z ]] \
    || fail "$label modificó lastRunAt"
  list_backups > "$temporary/after"
  cmp "$temporary/before" "$temporary/after" || fail "$label eliminó o agregó copias completas"
  printf 'OK: %s conserva copias y marcador.\n' "$label"
}

printf 'Construyendo la imagen de backup.\n'
if ! docker build --quiet --file "$repository/docker/backup/Dockerfile" --tag "$image" \
  "$repository" > "$temporary/build.log" 2>&1; then
  cat "$temporary/build.log" >&2
  fail 'no se pudo construir la imagen'
fi
docker network create "$network" >/dev/null
docker run -d --name "$task-db" --network "$network" --network-alias db \
  --env POSTGRES_USER=backup --env POSTGRES_PASSWORD=synthetic-backup-only \
  --env POSTGRES_DB=app postgres:18-alpine >/dev/null
for backend in media r2; do
  bucket=media
  [[ "$backend" != r2 ]] || bucket=backups
  docker run -d --name "$task-$backend" --network "$network" --network-alias "$backend" \
    --volume "$repository/docker/garage/garage.toml:/etc/garage.toml:ro" \
    --env GARAGE_DEFAULT_ACCESS_KEY=GK0c1a5ad191ta1de5a2r0110000dev0 \
    --env GARAGE_DEFAULT_SECRET_KEY=9b3f0e6d2c1a4f8e7d6c5b4a3928170f6e5d4c3b2a190807f6e5d4c3b2a19080 \
    --env "GARAGE_DEFAULT_BUCKET=$bucket" \
    dxflrs/garage:v2.3.0 /garage server --single-node --default-bucket >/dev/null
done
cat > "$temporary/rclone.conf" <<'CONFIG'
[media]
type = s3
provider = Other
endpoint = http://media:3900
region = garage
access_key_id = GK0c1a5ad191ta1de5a2r0110000dev0
secret_access_key = 9b3f0e6d2c1a4f8e7d6c5b4a3928170f6e5d4c3b2a190807f6e5d4c3b2a19080
force_path_style = true
[r2]
type = s3
provider = Other
endpoint = http://r2:3900
region = garage
access_key_id = GK0c1a5ad191ta1de5a2r0110000dev0
secret_access_key = 9b3f0e6d2c1a4f8e7d6c5b4a3928170f6e5d4c3b2a190807f6e5d4c3b2a19080
force_path_style = true
CONFIG
ready=false
for (( attempt=0; attempt<45; attempt++ )); do
  if docker exec "$task-db" pg_isready -U backup -d app >/dev/null 2>&1 \
    && run_box rclone lsf media:media >/dev/null 2>&1 \
    && run_box rclone lsf r2:backups >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'Postgres o los buckets no arrancaron'

sql "CREATE TABLE app_config (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by_id text);
CREATE TABLE example (id int PRIMARY KEY, note text NOT NULL);
INSERT INTO example VALUES (42, 'respaldo sintético de la OE');" >/dev/null
printf 'Portada sintética de la OE.\n' > "$temporary/object.txt"
run_box rclone copyto /test/object.txt media:media/portadas/sintetica.txt
run_box age-keygen -o /test/age-key.txt >/dev/null 2>&1
recipient=$(run_box age-keygen -y /test/age-key.txt)

run_backup
initial=$(list_backups)
[[ "$initial" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.tar\.zst\.age$ ]] || fail 'falta la primera copia completa'
[[ "$(sql "SELECT (value #>> '{}')::timestamptz > now() - interval '1 minute' FROM app_config WHERE key='backup.lastRunAt'")" == t ]] \
  || fail 'no se actualizó lastRunAt después de subir'

# Cada archivo previo es una copia cifrada válida, con fechas anteriores al respaldo actual.
for (( index=1; index<=11; index++ )); do
  printf -v old '202001%02dT000000Z-0000000000000000.tar.zst.age' "$index"
  run_box rclone copyto "r2:backups/casa-digital/$initial" "r2:backups/casa-digital/$old"
done
run_box rclone copyto /test/object.txt r2:backups/casa-digital/leeme.txt
run_box rclone copyto /test/object.txt r2:backups/ghpoints/conservar.age
run_backup
list_backups > "$temporary/retained"
[[ "$(wc -l < "$temporary/retained" | tr -d ' ')" == 12 ]] || fail 'no quedaron exactamente 12 copias'
if [[ "$(< "$temporary/retained")" == *20200101T* ]]; then
  fail 'se conservó la copia más antigua'
fi
run_box rclone cat r2:backups/ghpoints/conservar.age > "$temporary/untouched"
cmp "$temporary/object.txt" "$temporary/untouched" || fail 'se tocó el archivo de GHPOINTS'
run_box rclone cat r2:backups/casa-digital/leeme.txt > "$temporary/untouched"
cmp "$temporary/object.txt" "$temporary/untouched" || fail 'se tocó un archivo fuera del formato de backups'
printf 'OK: retención de 12 totales y otros archivos intactos.\n'

# Una segunda ejecución no puede entrar mientras otra sesión conserva el mismo lock.
docker exec --env PGAPPNAME=backup-test-lock "$task-db" psql -X -U backup -d app \
  -c 'SELECT pg_advisory_lock(7043, 39); SELECT pg_sleep(30)' >/dev/null 2>&1 &
holder=$!
locked=false
for (( attempt=0; attempt<15; attempt++ )); do
  if [[ "$(sql "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=7043 AND objid=39 AND granted)")" == t ]]; then
    locked=true
    break
  fi
  sleep 1
done
[[ "$locked" == true ]] || fail 'no se pudo preparar el lock concurrente'
assert_failure 'respaldo concurrente'
sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='backup-test-lock'" >/dev/null
wait "$holder" || true

assert_failure 'base inaccesible' --env DATABASE_URL=postgresql://backup:synthetic-backup-only@db:5432/no_existe
mkdir "$temporary/wrappers"
cat > "$temporary/wrappers/pg_dump" <<'WRAPPER'
#!/usr/bin/env bash
printf 'Fallo sintético de pg_dump después de adquirir el lock.\n' >&2
exit 1
WRAPPER
chmod +x "$temporary/wrappers/pg_dump"
assert_failure 'dump fallido' --env PATH=/test/wrappers:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[[ "$(< "$temporary/failure.log")" == *'Fallo sintético de pg_dump'* ]] || fail 'no se alcanzó el dump'
rm "$temporary/wrappers/pg_dump"
assert_failure 'bucket de origen inaccesible' --env S3_ENDPOINT=http://127.0.0.1:1
assert_failure 'cifrado fallido' --env AGE_RECIPIENT=no-es-una-clave-age
assert_failure 'subida fallida' --env R2_ENDPOINT=http://127.0.0.1:1

# Se transporta un archivo real, pero se simula corrupción al comprobar su descarga.
cat > "$temporary/wrappers/rclone" <<'WRAPPER'
#!/usr/bin/env bash
if [[ "$1" == cat ]]; then
  printf 'bytes corruptos\n'
  exit 0
fi
exec /usr/bin/rclone "$@"
WRAPPER
chmod +x "$temporary/wrappers/rclone"
assert_failure 'verificación remota fallida' --env PATH=/test/wrappers:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
run_backup
[[ "$(list_backups | wc -l | tr -d ' ')" == 12 ]] || fail 'la recuperación tras los fallos no conservó 12 copias'
printf 'OK: una nueva corrida puede adquirir el lock después de los fallos.\n'

run_box rclone copyto "r2:backups/casa-digital/$initial" /test/archive.age
run_box bash -c 'set -euo pipefail; mkdir restored; age -d -i age-key.txt archive.age | zstd -dq | tar -C restored -xf -'
run_box jq -e '.formatVersion == 1 and .databaseFile == "database.dump" and .mediaDirectory == "media"' \
  /test/restored/manifest.json >/dev/null
cmp "$temporary/object.txt" "$temporary/restored/media/portadas/sintetica.txt" || fail 'el medio restaurado difiere'
docker exec "$task-db" createdb -U backup restored
run_box pg_restore --no-owner --no-acl --exit-on-error \
  --dbname=postgresql://backup:synthetic-backup-only@db:5432/restored /test/restored/database.dump
restored=$(docker exec "$task-db" psql -X -U backup -d restored -At -c 'SELECT note FROM example WHERE id=42')
[[ "$restored" == 'respaldo sintético de la OE' ]] || fail 'los datos restaurados difieren'
printf 'OK: descifrado, manifiesto, medio y restauración PostgreSQL 18 comprobados.\n'
