# Decky Books

## Репозиторий проекта

`https://github.com/genialniychelovek/Decky-books`


Decky Books — плагин-читалка для Decky Loader / Steam Deck Gaming Mode в стиле Apple Books.

## Возможности

- Русский интерфейс по умолчанию.
- Переключатель языка: Русский / English.
- Локальная библиотека книг из `~/Books`, `~/Documents/Books` и `~/Downloads`.
- Поддержка `.txt`, `.md`, `.epub`, `.fb2`, `.zip`; `.pdf` отображается как заготовка для дальнейшей поддержки извлечения текста.
- Карточки книг, прогресс чтения, размер шрифта, темы «Сепия», «Тёмная», «Белая».
- Обновление плагина из вашего GitHub-репозитория прямо из интерфейса.
- OPDS-поиск Flibusta через `https://http.flibusta.is/opds`.

> Используйте OPDS-поиск только для книг, к которым у вас есть законный доступ. Плагин не обходит DRM, платный доступ или региональные ограничения.

## Что загрузить на GitHub

Этот архив уже настроен под репозиторий `https://github.com/genialniychelovek/Decky-books`. Загрузите/обновите содержимое архива в этом репозитории. В корне репозитория должен лежать файл `plugin.json`.

Подходящая структура:

```text
repo-root/
├── plugin.json
├── package.json
├── main.py
├── src/
├── assets/
├── install-from-github.sh
└── README.md
```

Также можно положить проект в подпапку, например `decky-books-plugin/`, но тогда в настройках плагина укажите `subdir`.

## Настройка GitHub-обновления в плагине

В интерфейсе плагина заполните:

- **Источник GitHub**: `https://github.com/genialniychelovek/Decky-books`
- **Branch**: `main`
- **Subdir**: оставить пустым, если `plugin.json` лежит в корне репозитория

Нажмите **Сохранить репозиторий GitHub**, затем **Скачать / обновить из GitHub**. После обновления перезапустите Decky Loader.

Настройки сохраняются на Steam Deck здесь:

```bash
~/.config/decky-books/repo.json
```

## Установка одной командой из вашего репозитория

```bash
REPO_URL="https://github.com/genialniychelovek/Decky-books" BRANCH="main" ./install-from-github.sh
```

Если проект лежит в подпапке:

```bash
REPO_URL="https://github.com/genialniychelovek/Decky-books" BRANCH="main" SUBDIR="decky-books-plugin" ./install-from-github.sh
```

## Сборка

```bash
pnpm i
pnpm run build
```

## Ручная установка

Скопируйте папку проекта в:

```bash
~/homebrew/plugins/decky-books
```

Затем выполните:

```bash
pnpm i
pnpm run build
```

После этого перезапустите Decky Loader.

## Где хранить книги

Положите книги в любую из папок:

- `~/Books`
- `~/Documents/Books`
- `~/Downloads`

## Примечания

EPUB/FB2/TXT читаются средствами Python без внешних зависимостей. Для полноценной поддержки PDF можно добавить зависимость вроде PyMuPDF или pdfminer.six и реализовать извлечение текста в `_read_pdf()`.
