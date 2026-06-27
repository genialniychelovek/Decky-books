import {
  definePlugin,
  PanelSection,
  PanelSectionRow,
  ServerAPI,
  staticClasses,
  ButtonItem,
  DropdownItem,
  SliderField,
  showToast,
} from "@decky/ui";
import { FaBookOpen } from "react-icons/fa";
import React, { useEffect, useMemo, useRef, useState } from "react";

interface Book {
  id: string;
  title: string;
  format: string;
  path: string;
  size: number;
  progress: number;
}

interface ReaderPayload {
  ok: boolean;
  id?: string;
  title?: string;
  path?: string;
  text?: string;
  error?: string;
}

interface RemoteLink {
  href: string;
  type: string;
  rel: string;
  label: string;
}

interface RemoteBook {
  id: string;
  title: string;
  authors: string;
  summary: string;
  links: RemoteLink[];
}

const call = async <T,>(serverAPI: ServerAPI, method: string, ...args: any[]): Promise<T> => {
  const res = await serverAPI.callPluginMethod(method, args);
  if (!res.success) throw new Error(String(res.result ?? "Plugin call failed"));
  return res.result as T;
};

const STRINGS: Record<string, Record<string, string>> = {
  ru: {
    reader: "Читалка", library: "Библиотека", backLibrary: "← Библиотека", refresh: "Обновить библиотеку", scanning: "Сканирование…",
    putBooks: "Положите книги в ~/Books, ~/Documents/Books или ~/Downloads.", githubSource: "Источник GitHub", saveRepo: "Сохранить репозиторий GitHub",
    githubSaved: "Репозиторий GitHub сохранён", updateGithub: "Скачать / обновить из GitHub", updating: "Обновление…", restartDecky: "Обновлено файлов: {count}. Перезапустите Decky.",
    flibustaSearch: "Поиск Flibusta OPDS", legalWarning: "Используйте только для книг, к которым у вас есть законный доступ. Источник: https://http.flibusta.is/opds",
    searchPlaceholder: "Название, автор, ключевые слова", search: "Искать", foundBooks: "Найдено книг: {count}", unknownAuthor: "Автор неизвестен",
    download: "скачать", savedTo: "Сохранено: {path}", noBooks: "Книги не найдены.", fontSize: "Размер шрифта", language: "Язык", theme: "Тема",
    sepia: "Сепия", dark: "Тёмная", white: "Белая", repoUrl: "https://github.com/user/repo", branch: "main", subdir: "папка, необязательно",
    searchFailed: "Ошибка поиска", downloadFailed: "Ошибка загрузки", pluginTitle: "Decky Books"
  },
  en: {
    reader: "Reader", library: "Library", backLibrary: "← Library", refresh: "Refresh library", scanning: "Scanning…",
    putBooks: "Put books into ~/Books, ~/Documents/Books, or ~/Downloads.", githubSource: "GitHub source", saveRepo: "Save GitHub repo",
    githubSaved: "GitHub repo saved", updateGithub: "Download / update from GitHub", updating: "Updating…", restartDecky: "Updated {count} files. Restart Decky.",
    flibustaSearch: "Flibusta OPDS search", legalWarning: "Use only for books you are legally allowed to access. Source: https://http.flibusta.is/opds",
    searchPlaceholder: "Title, author, keywords", search: "Search", foundBooks: "Found {count} books", unknownAuthor: "Unknown author",
    download: "download", savedTo: "Saved to {path}", noBooks: "No books found.", fontSize: "Font size", language: "Language", theme: "Theme",
    sepia: "Sepia", dark: "Dark", white: "White", repoUrl: "https://github.com/user/repo", branch: "main", subdir: "subdir, optional",
    searchFailed: "Search failed", downloadFailed: "Download failed", pluginTitle: "Decky Books"
  }
};

const makeT = (language: string) => (key: string, vars: Record<string, any> = {}) => {
  let value = (STRINGS[language] || STRINGS.ru)[key] || STRINGS.ru[key] || key;
  for (const [k, v] of Object.entries(vars)) value = value.replace(`{${k}}`, String(v));
  return value;
};

const AppleCard = ({ book, onOpen }: { book: Book; onOpen: () => void }) => (
  <div
    onClick={onOpen}
    style={{
      padding: "12px",
      marginBottom: "10px",
      borderRadius: "16px",
      background: "linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.04))",
      boxShadow: "0 8px 22px rgba(0,0,0,.25)",
      border: "1px solid rgba(255,255,255,.10)",
    }}
  >
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <div
        style={{
          width: 48,
          height: 68,
          borderRadius: 8,
          background: "linear-gradient(160deg, #f2c078, #8d5524)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          color: "#261608",
        }}
      >
        {book.format}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{book.title}</div>
        <div style={{ opacity: 0.65, fontSize: 12 }}>{book.path}</div>
        <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,.15)", marginTop: 8 }}>
          <div style={{ width: `${Math.round((book.progress || 0) * 100)}%`, height: 5, borderRadius: 999, background: "rgba(255,255,255,.75)" }} />
        </div>
      </div>
    </div>
  </div>
);

const Reader = ({ serverAPI }: { serverAPI: ServerAPI }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [active, setActive] = useState<ReaderPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("sepia");
  const [fontSize, setFontSize] = useState(18);
  const [language, setLanguage] = useState("ru");
  const [repoUrl, setRepoUrl] = useState("https://github.com/YOUR_USER/YOUR_REPO");
  const [repoBranch, setRepoBranch] = useState("main");
  const [repoSubdir, setRepoSubdir] = useState("");
  const [flibustaQuery, setFlibustaQuery] = useState("");
  const [flibustaResults, setFlibustaResults] = useState<RemoteBook[]>([]);
  const readerRef = useRef<HTMLDivElement>(null);
  const t = useMemo(() => makeT(language), [language]);

  const refresh = async () => {
    setLoading(true);
    try {
      setBooks(await call<Book[]>(serverAPI, "list_books"));
      const settings = await call<any>(serverAPI, "get_settings");
      setTheme(settings.theme ?? "sepia");
      setFontSize(settings.fontSize ?? 18);
      setLanguage(settings.language ?? "ru");
      const repo = await call<any>(serverAPI, "get_repo_config");
      setRepoUrl(repo.repoUrl ?? "https://github.com/YOUR_USER/YOUR_REPO");
      setRepoBranch(repo.branch ?? "main");
      setRepoSubdir(repo.subdir ?? "");
    } catch (e: any) {
      showToast({ title: "Decky Books", body: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const openBook = async (book: Book) => {
    setLoading(true);
    try {
      const payload = await call<ReaderPayload>(serverAPI, "read_book", book.path);
      setActive(payload);
      setTimeout(() => {
        if (readerRef.current && book.progress) {
          readerRef.current.scrollTop = readerRef.current.scrollHeight * book.progress;
        }
      }, 200);
    } catch (e: any) {
      showToast({ title: "Decky Books", body: e.message });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (next: any) => {
    await call(serverAPI, "set_settings", { theme, fontSize, ...next });
  };


  const saveRepo = async () => {
    try {
      const cfg = await call<any>(serverAPI, "set_repo_config", { repoUrl, branch: repoBranch, subdir: repoSubdir });
      setRepoUrl(cfg.repoUrl);
      setRepoBranch(cfg.branch);
      setRepoSubdir(cfg.subdir);
      showToast({ title: "Decky Books", body: t("githubSaved") });
    } catch (e: any) {
      showToast({ title: "Decky Books", body: e.message });
    }
  };

  const updateFromGithub = async () => {
    setLoading(true);
    try {
      const result = await call<any>(serverAPI, "update_from_github", { repoUrl, branch: repoBranch, subdir: repoSubdir });
      showToast({ title: "Decky Books", body: t("restartDecky", { count: result.copied }) });
    } catch (e: any) {
      showToast({ title: "Decky Books", body: e.message });
    } finally {
      setLoading(false);
    }
  };

  const searchFlibusta = async () => {
    setLoading(true);
    try {
      const result = await call<any>(serverAPI, "search_flibusta", flibustaQuery);
      if (!result.ok) throw new Error(result.error || t("searchFailed"));
      setFlibustaResults(result.results || []);
      showToast({ title: "Decky Books", body: t("foundBooks", { count: (result.results || []).length }) });
    } catch (e: any) {
      showToast({ title: "Decky Books", body: e.message });
    } finally {
      setLoading(false);
    }
  };

  const downloadRemote = async (book: RemoteBook, link: RemoteLink) => {
    setLoading(true);
    try {
      const result = await call<any>(serverAPI, "download_flibusta_book", link.href, book.title);
      if (!result.ok) throw new Error(result.error || t("downloadFailed"));
      showToast({ title: "Decky Books", body: t("savedTo", { path: result.path }) });
      await refresh();
    } catch (e: any) {
      showToast({ title: "Decky Books", body: e.message });
    } finally {
      setLoading(false);
    }
  };

  const readerStyle = useMemo(() => {
    const themes: any = {
      sepia: { background: "#f4ecd8", color: "#2c2118" },
      dark: { background: "#111", color: "#e8e1d4" },
      white: { background: "#f7f7f7", color: "#181818" },
    };
    return themes[theme] ?? themes.sepia;
  }, [theme]);

  const onScroll = async () => {
    const el = readerRef.current;
    if (!el || !active?.id) return;
    const progress = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    await call(serverAPI, "save_progress", active.id, progress);
  };

  if (active?.ok) {
    return (
      <PanelSection title={active.title || t("reader")}>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => { setActive(null); refresh(); }}>{t("backLibrary")}</ButtonItem>
        </PanelSectionRow>

        <PanelSectionRow>
          <DropdownItem
            rgOptions={[{ label: "Русский", data: "ru" }, { label: "English", data: "en" }]}
            selectedOption={language}
            onChange={(o: any) => { setLanguage(o.data); saveSettings({ language: o.data }); }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            rgOptions={[
              { label: t("sepia"), data: "sepia" },
              { label: t("dark"), data: "dark" },
              { label: t("white"), data: "white" },
            ]}
            selectedOption={theme}
            onChange={(o: any) => { setTheme(o.data); saveSettings({ theme: o.data }); }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField label={t("fontSize")} value={fontSize} min={14} max={28} step={1} onChange={(v: number) => { setFontSize(v); saveSettings({ fontSize: v }); }} />
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            ref={readerRef}
            onScroll={onScroll}
            style={{
              ...readerStyle,
              maxHeight: "520px",
              overflowY: "auto",
              borderRadius: 18,
              padding: 20,
              lineHeight: 1.65,
              fontSize,
              whiteSpace: "pre-wrap",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)",
            }}
          >
            {active.text}
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection title={t("pluginTitle")}>
      <PanelSectionRow>
        <DropdownItem
          rgOptions={[{ label: "Русский", data: "ru" }, { label: "English", data: "en" }]}
          selectedOption={language}
          onChange={(o: any) => { setLanguage(o.data); saveSettings({ language: o.data }); }}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={refresh}>{loading ? t("scanning") : t("refresh")}</ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ opacity: .7, marginBottom: 10 }}>{t("putBooks")}</div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div style={{ marginTop: 12, opacity: .85, fontWeight: 700 }}>{t("githubSource")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl((e.target as HTMLInputElement).value)}
            placeholder={t("repoUrl")}
            style={{ padding: 8, borderRadius: 8, width: "100%" }}
          />
          <input
            value={repoBranch}
            onChange={(e) => setRepoBranch((e.target as HTMLInputElement).value)}
            placeholder={t("branch")}
            style={{ padding: 8, borderRadius: 8, width: "100%" }}
          />
          <input
            value={repoSubdir}
            onChange={(e) => setRepoSubdir((e.target as HTMLInputElement).value)}
            placeholder={t("subdir")}
            style={{ padding: 8, borderRadius: 8, width: "100%" }}
          />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={saveRepo}>{t("saveRepo")}</ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={updateFromGithub}>{loading ? t("updating") : t("updateGithub")}</ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ marginTop: 12, opacity: .85, fontWeight: 700 }}>{t("flibustaSearch")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ opacity: .7, fontSize: 12 }}>{t("legalWarning")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <input
            value={flibustaQuery}
            onChange={(e) => setFlibustaQuery((e.target as HTMLInputElement).value)}
            placeholder={t("searchPlaceholder")}
            style={{ padding: 8, borderRadius: 8, flex: 1 }}
          />
          <button onClick={searchFlibusta} style={{ padding: 8, borderRadius: 8 }}>{loading ? "…" : t("search")}</button>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ width: "100%" }}>
          {flibustaResults.map((book) => (
            <div key={book.id} style={{ padding: 10, marginBottom: 8, borderRadius: 12, background: "rgba(255,255,255,.08)" }}>
              <div style={{ fontWeight: 700 }}>{book.title}</div>
              <div style={{ opacity: .65, fontSize: 12 }}>{book.authors || t("unknownAuthor")}</div>
              {book.summary ? <div style={{ opacity: .75, fontSize: 12, marginTop: 6 }}>{book.summary}</div> : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {book.links.map((link, idx) => (
                  <button key={`${link.href}-${idx}`} onClick={() => downloadRemote(book, link)} style={{ padding: "6px 8px", borderRadius: 8 }}>
                    {(link.type || link.label || t("download")).replace("application/", "").replace("+zip", "")}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div>{books.length === 0 ? t("noBooks") : books.map((b) => <AppleCard key={b.id} book={b} onOpen={() => openBook(b)} />)}</div>
      </PanelSectionRow>
    </PanelSection>
  );
};

export default definePlugin((serverAPI: ServerAPI) => ({
  title: <div className={staticClasses.Title}>Decky Books</div>,
  content: <Reader serverAPI={serverAPI} />,
  icon: <FaBookOpen />,
  onDismount() {},
}));
