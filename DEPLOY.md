# Деплой на Aeza

Репозиторий: `TalisMan701/love`, ветка `main`.
Сервер: `77.221.154.156`, SSH `root@77.221.154.156`, порт `22`.
Домен: `artkompaneets.ru`; `www.artkompaneets.ru` перенаправляется на основной адрес.

## DNS в Aeza

NS домена уже указывают на `a.aeza-dns.net` и `b.aeza-dns.net`. При первоначальной проверке 13 октября 2026 года A/AAAA-записей основного домена не было, `www` не существовал.

Добавить в DNS-зону домена:

| Тип | Имя | Значение |
| --- | --- | --- |
| A | @ | 77.221.154.156 |
| CNAME | www | artkompaneets.ru |

Если панель требует полный адрес вместо `@`, использовать `artkompaneets.ru`. Для CNAME панель может потребовать `artkompaneets.ru.` с точкой в конце. TTL можно оставить стандартным. AAAA добавлять только при наличии настроенного IPv6 этого сервера.

Проверить после сохранения:

```powershell
Resolve-DnsName artkompaneets.ru -Type A -Server 1.1.1.1
Resolve-DnsName www.artkompaneets.ru -Type A -Server 1.1.1.1
```

Результат должен содержать `77.221.154.156`. Ранее закешированный ответ без адреса может сохраняться до окончания TTL. Для HTTPS сервер должен быть доступен извне на TCP-портах 80 и 443; при наличии сетевого firewall в Aeza открыть эти порты.

## Настройка сервера

`deploy/setup-server.sh` рассчитан на проверенный пустой сервер Ubuntu. Он:

- устанавливает Caddy из официального stable-репозитория и включает его systemd-службу;
- создаёт пользователя `love-deploy` без sudo и отдельный SSH-доступ по ключу GitHub Actions;
- выдаёт ему права на `/srv/love`, где хранятся публикации;
- устанавливает `deploy/Caddyfile`, сохраняя исходный конфиг в `/etc/caddy/Caddyfile.before-love`.

Ключ в `authorized_keys` имеет опцию `restrict`: без SSH-туннелей, проброса агента и PTY. Пользователь может обновлять сайт, но не получает административных прав. Если на сервере обнаружена чужая конфигурация Caddy, Nginx или Apache, скрипт останавливается.

При подготовке ключ сгенерирован в локальной игнорируемой папке `.deploy-private/`. Приватный ключ на сервер не отправляется. Для подготовленных файлов на сервере команда установки:

```bash
bash /root/love-bootstrap/setup-server.sh /root/love-bootstrap/github-actions.pub
```

Если подготовка выполняется заново, передать `deploy/Caddyfile`, `deploy/setup-server.sh` и публичную часть ключа в `/root/love-bootstrap/` через SCP. Приватную часть оставить локально и в GitHub Secret.

## GitHub Actions

В репозитории открыть **Settings → Secrets and variables → Actions → New repository secret**.

Создать один секрет:

| Имя | Значение |
| --- | --- |
| DEPLOY_SSH_KEY | Всё содержимое локального `.deploy-private/github-actions`, включая BEGIN/END |

Скопировать значение в буфер обмена без вывода в терминал, находясь в корне проекта:

```powershell
Get-Content -Raw .\.deploy-private\github-actions | Set-Clipboard
```

Вставить в поле Secret на GitHub. Не добавлять этот ключ в Git, чат или публичные файлы. Публичная часть ключа и закреплённый публичный ключ сервера секретами не являются.

Workflow `.github/workflows/deploy.yml` запускается при push в `main` и вручную через **Actions → Deploy to Aeza → Run workflow**. Запуск из других веток не публикует сайт. Используются официальные Actions с закреплёнными SHA; права GitHub Token ограничены чтением репозитория.

Перед загрузкой выполняются проверки JavaScript, существующие тесты прелоадера, проверки синтаксиса Bash и тесты переключения публикаций/отката. Node.js требуется только на GitHub runner. На сервер отправляются исключительно файлы из `letter-for-you/dist/`.

Каждая публикация попадает в новый каталог `/srv/love/releases/<commit>-<run>-<attempt>`. После проверки обязательных файлов ссылка `/srv/love/current` переключается одной операцией. Затем проверяется, что Caddy отдаёт нужный `release.txt`; при неудаче восстанавливается предыдущая публикация. Параллельные публикации ограничены GitHub concurrency и серверным `flock`.

Последняя проверка workflow обращается к публичному HTTPS-адресу. Если DNS ещё не подключён или сертификат не получен, этот шаг завершится ошибкой, даже если файлы успешно опубликованы. После исправления DNS запустить workflow заново.

## Проверка и обслуживание

```bash
systemctl status caddy --no-pager
journalctl -u caddy -n 60 --no-pager
caddy validate --config /etc/caddy/Caddyfile
readlink /srv/love/current
curl -I http://77.221.154.156/
curl -I https://artkompaneets.ru/
curl -I https://www.artkompaneets.ru/
```

Caddy получает и продлевает сертификаты автоматически. Конфиг также позволяет открыть сайт по `http://77.221.154.156` и использует этот виртуальный хост для локальной проверки деплоя. CSS, JS и HTML получают `Cache-Control: no-cache`, чтобы браузер проверял актуальность после обновлений. Аудио обслуживается статическим сервером с поддержкой Range-запросов.

Предыдущие публикации сохраняются. Для отката выбрать существующий каталог из `/srv/love/releases/` и выполнить под `love-deploy`, подставив его имя:

```bash
release=/srv/love/releases/ИМЯ_ПРЕДЫДУЩЕЙ_ПУБЛИКАЦИИ
test -s "$release/index.html" && test -s "$release/release.txt"
ln -s "$release" /srv/love/.rollback
mv -Tf /srv/love/.rollback /srv/love/current
```

Откат делать после окончания активного workflow. Старые публикации занимают примерно 4,5 МБ каждая; при большом количестве обновлений удалять ненужные, сохраняя текущую и нужные для отката.

Сайт доступен всем, кто знает адрес. `X-Robots-Tag` просит поисковики не индексировать его, но не ограничивает доступ. Перед размещением настоящего кода и PIN сертификата нужно отдельно настроить защиту доступа; сам публичный GitHub-репозиторий также нельзя использовать для действующих кодов.

Официальная документация: [установка Caddy](https://caddyserver.com/docs/install), [автоматический HTTPS](https://caddyserver.com/docs/quick-starts/https), [GitHub Actions Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
