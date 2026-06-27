import os
import json
import re
import zipfile
import html
import shutil
import tempfile
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Any, Optional

PLUGIN_DIR = Path(__file__).resolve().parent
DATA_DIR = Path.home() / ".config" / "decky-books"
STATE_FILE = DATA_DIR / "state.json"
REPO_FILE = DATA_DIR / "repo.json"
BOOK_DIRS = [Path.home() / "Books", Path.home() / "Documents" / "Books", Path.home() / "Downloads"]
EXTS = {".txt", ".md", ".epub", ".pdf", ".fb2", ".zip"}
DEFAULT_REPO = {
    "repoUrl": "https://github.com/YOUR_USER/YOUR_REPO",
    "branch": "main",
    "subdir": "",
    "autoUpdate": False,
}

FLIBUSTA_BASE = "https://http.flibusta.is"
OPDS_NS = {"atom": "http://www.w3.org/2005/Atom", "dc": "http://purl.org/dc/terms/"}
ACQUISITION_RELS = {
    "http://opds-spec.org/acquisition",
    "http://opds-spec.org/acquisition/open-access",
    "http://opds-spec.org/acquisition/buy",
    "http://opds-spec.org/acquisition/borrow",
    "http://opds-spec.org/acquisition/sample",
}

SKIP_UPDATE_NAMES = {".git", "node_modules", "__pycache__", ".DS_Store"}


def _ensure():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STATE_FILE.exists():
        STATE_FILE.write_text(json.dumps({"progress": {}, "settings": {"theme": "sepia", "fontSize": 18, "language": "ru"}}, indent=2))
    if not REPO_FILE.exists():
        REPO_FILE.write_text(json.dumps(DEFAULT_REPO, ensure_ascii=False, indent=2))


def _state() -> Dict[str, Any]:
    _ensure()
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {"progress": {}, "settings": {"theme": "sepia", "fontSize": 18, "language": "ru"}}


def _save_state(s: Dict[str, Any]):
    _ensure()
    STATE_FILE.write_text(json.dumps(s, ensure_ascii=False, indent=2))


def _repo_config() -> Dict[str, Any]:
    _ensure()
    try:
        data = json.loads(REPO_FILE.read_text())
    except Exception:
        data = {}
    merged = {**DEFAULT_REPO, **{k: v for k, v in data.items() if k in DEFAULT_REPO}}
    return merged


def _save_repo_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    current = _repo_config()
    for key in DEFAULT_REPO:
        if key in cfg:
            current[key] = cfg[key]
    current["repoUrl"] = str(current.get("repoUrl", "")).strip().rstrip("/")
    current["branch"] = str(current.get("branch", "main") or "main").strip()
    current["subdir"] = str(current.get("subdir", "") or "").strip().strip("/")
    current["autoUpdate"] = bool(current.get("autoUpdate", False))
    REPO_FILE.write_text(json.dumps(current, ensure_ascii=False, indent=2))
    return current


def _github_archive_url(repo_url: str, branch: str) -> str:
    parsed = urllib.parse.urlparse(repo_url)
    host = parsed.netloc.lower()
    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if host != "github.com" or len(parts) < 2:
        raise ValueError("Укажите ссылку вида https://github.com/user/repo")
    owner, repo = parts[0], parts[1].removesuffix(".git")
    safe_branch = urllib.parse.quote(branch or "main", safe="")
    return f"https://github.com/{owner}/{repo}/archive/refs/heads/{safe_branch}.zip"


def _copy_tree(src: Path, dst: Path) -> int:
    copied = 0
    for item in src.iterdir():
        if item.name in SKIP_UPDATE_NAMES:
            continue
        target = dst / item.name
        if item.is_dir():
            if target.exists() and target.is_file():
                target.unlink()
            target.mkdir(parents=True, exist_ok=True)
            copied += _copy_tree(item, target)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
            copied += 1
    return copied


def _book_id(path: Path) -> str:
    return str(abs(hash(str(path))))


def _clean_html(raw: str) -> str:
    raw = re.sub(r"<script[\s\S]*?</script>", "", raw, flags=re.I)
    raw = re.sub(r"<style[\s\S]*?</style>", "", raw, flags=re.I)
    raw = re.sub(r"</(p|div|h[1-6]|br|li)>", "\n", raw, flags=re.I)
    raw = re.sub(r"<[^>]+>", "", raw)
    raw = html.unescape(raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()


def _read_txt(path: Path) -> str:
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return path.read_text(encoding=enc)
        except Exception:
            pass
    return "Не удалось прочитать текстовый файл."


def _read_epub(path: Path) -> str:
    parts: List[str] = []
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith((".xhtml", ".html", ".htm"))]
        names.sort()
        for name in names:
            try:
                parts.append(_clean_html(z.read(name).decode("utf-8", "ignore")))
            except Exception:
                continue
    return "\n\n".join([p for p in parts if p]) or "EPUB найден, но текст не извлечён."


def _read_fb2(path: Path) -> str:
    raw = _read_txt(path)
    return _clean_html(raw)


def _read_zip(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith((".fb2", ".txt", ".md", ".html", ".htm", ".xhtml"))]
        names.sort()
        if not names:
            return "ZIP найден, но внутри нет поддерживаемого текстового формата."
        data = z.read(names[0])
        for enc in ("utf-8", "cp1251", "latin-1"):
            try:
                text = data.decode(enc)
                break
            except Exception:
                text = data.decode("utf-8", "ignore")
        return _clean_html(text) if names[0].lower().endswith((".fb2", ".html", ".htm", ".xhtml")) else text


def _read_pdf(_path: Path) -> str:
    return "PDF найден. Для полноценного текста добавьте в backend зависимость PyMuPDF/fitz или pdfminer.six и реализуйте extraction в _read_pdf()."


def _safe_filename(name: str, ext: str) -> str:
    name = re.sub(r"[\\/:*?\"<>|]+", "_", name).strip().strip(".") or "book"
    return f"{name[:120]}{ext}"


def _absolute_url(href: str) -> str:
    return urllib.parse.urljoin(FLIBUSTA_BASE, href)


def _opds_get(url: str) -> ET.Element:
    req = urllib.request.Request(url, headers={"User-Agent": "DeckyBooksOPDS/1.0"})
    with urllib.request.urlopen(req, timeout=25) as response:
        data = response.read()
    return ET.fromstring(data)


def _entry_text(entry: ET.Element, tag: str) -> str:
    node = entry.find(f"atom:{tag}", OPDS_NS)
    return (node.text or "").strip() if node is not None else ""


def _parse_opds_entries(root: ET.Element) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for entry in root.findall("atom:entry", OPDS_NS):
        title = _entry_text(entry, "title") or "Без названия"
        authors = []
        for a in entry.findall("atom:author", OPDS_NS):
            name = a.find("atom:name", OPDS_NS)
            if name is not None and name.text:
                authors.append(name.text.strip())
        links = []
        for link in entry.findall("atom:link", OPDS_NS):
            href = link.attrib.get("href", "")
            if not href:
                continue
            rel = link.attrib.get("rel", "")
            typ = link.attrib.get("type", "")
            label = link.attrib.get("title", "") or typ or rel or "link"
            if rel in ACQUISITION_RELS or "acquisition" in rel or typ in {"application/epub+zip", "application/fb2+zip", "application/x-fictionbook+xml", "text/plain", "application/pdf"}:
                links.append({"href": _absolute_url(href), "type": typ, "rel": rel, "label": label})
        if links:
            out.append({
                "id": _entry_text(entry, "id") or title,
                "title": title,
                "authors": ", ".join(authors),
                "summary": _clean_html(_entry_text(entry, "summary") or _entry_text(entry, "content"))[:500],
                "links": links[:8],
            })
    return out


def _guess_ext(url: str, content_type: str) -> str:
    path = urllib.parse.urlparse(url).path.lower()
    for ext in (".epub", ".fb2", ".zip", ".txt", ".pdf"):
        if path.endswith(ext):
            return ext
    if "epub" in content_type:
        return ".epub"
    if "fb2" in content_type or "fictionbook" in content_type:
        return ".fb2"
    if "zip" in content_type:
        return ".zip"
    if "pdf" in content_type:
        return ".pdf"
    return ".txt"


class Plugin:
    async def list_books(self) -> List[Dict[str, Any]]:
        s = _state()
        books = []
        for base in BOOK_DIRS:
            if not base.exists():
                continue
            for p in base.rglob("*"):
                if p.is_file() and p.suffix.lower() in EXTS:
                    bid = _book_id(p)
                    books.append({
                        "id": bid,
                        "title": p.stem.replace("_", " ").replace("-", " ").strip(),
                        "format": p.suffix.lower().replace(".", "").upper(),
                        "path": str(p),
                        "size": p.stat().st_size,
                        "progress": s.get("progress", {}).get(bid, 0)
                    })
        return sorted(books, key=lambda b: b["title"].lower())

    async def read_book(self, path: str) -> Dict[str, Any]:
        p = Path(path).expanduser().resolve()
        if not p.exists() or p.suffix.lower() not in EXTS:
            return {"ok": False, "error": "Файл не найден или формат не поддерживается."}
        if p.suffix.lower() in {".txt", ".md"}:
            text = _read_txt(p)
        elif p.suffix.lower() == ".epub":
            text = _read_epub(p)
        elif p.suffix.lower() == ".fb2":
            text = _read_fb2(p)
        elif p.suffix.lower() == ".zip":
            text = _read_zip(p)
        else:
            text = _read_pdf(p)
        return {"ok": True, "id": _book_id(p), "title": p.stem, "path": str(p), "text": text}

    async def search_flibusta(self, query: str) -> Dict[str, Any]:
        q = str(query or "").strip()
        if len(q) < 2:
            return {"ok": False, "error": "Введите минимум 2 символа для поиска."}
        quoted = urllib.parse.quote(q)
        urls = [
            f"{FLIBUSTA_BASE}/opds/search/{quoted}",
            f"{FLIBUSTA_BASE}/opds/search?searchTerm={quoted}",
            f"{FLIBUSTA_BASE}/opds/search?term={quoted}",
        ]
        last_error = ""
        for url in urls:
            try:
                root = _opds_get(url)
                results = _parse_opds_entries(root)
                return {"ok": True, "source": url, "results": results}
            except Exception as e:
                last_error = str(e)
        return {"ok": False, "error": f"Не удалось получить OPDS-результаты: {last_error}"}

    async def download_flibusta_book(self, url: str, title: str = "book") -> Dict[str, Any]:
        parsed = urllib.parse.urlparse(str(url or ""))
        if parsed.scheme not in {"http", "https"} or "flibusta.is" not in parsed.netloc:
            return {"ok": False, "error": "Разрешены только ссылки Flibusta OPDS."}
        BOOK_DIRS[0].mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "DeckyBooksOPDS/1.0"})
        with urllib.request.urlopen(req, timeout=40) as response:
            data = response.read()
            content_type = response.headers.get("Content-Type", "")
        ext = _guess_ext(url, content_type)
        path = BOOK_DIRS[0] / _safe_filename(title, ext)
        i = 2
        while path.exists():
            path = BOOK_DIRS[0] / _safe_filename(f"{title} {i}", ext)
            i += 1
        path.write_bytes(data)
        return {"ok": True, "path": str(path), "size": path.stat().st_size}

    async def save_progress(self, book_id: str, progress: float) -> Dict[str, Any]:
        s = _state()
        s.setdefault("progress", {})[book_id] = max(0, min(1, float(progress)))
        _save_state(s)
        return {"ok": True}

    async def get_settings(self) -> Dict[str, Any]:
        return _state().get("settings", {"theme": "sepia", "fontSize": 18, "language": "ru"})

    async def set_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        s = _state()
        current = s.setdefault("settings", {})
        current.update({k: v for k, v in settings.items() if k in {"theme", "fontSize", "language"}})
        _save_state(s)
        return current

    async def get_repo_config(self) -> Dict[str, Any]:
        return _repo_config()

    async def set_repo_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        return _save_repo_config(config)

    async def update_from_github(self, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        cfg = _save_repo_config(config or {})
        archive_url = _github_archive_url(cfg["repoUrl"], cfg["branch"])
        with tempfile.TemporaryDirectory(prefix="decky-books-update-") as tmp:
            tmp_path = Path(tmp)
            zip_path = tmp_path / "repo.zip"
            request = urllib.request.Request(archive_url, headers={"User-Agent": "DeckyBooksUpdater/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                zip_path.write_bytes(response.read())
            with zipfile.ZipFile(zip_path) as z:
                z.extractall(tmp_path / "repo")
            roots = [p for p in (tmp_path / "repo").iterdir() if p.is_dir()]
            if not roots:
                raise RuntimeError("Архив GitHub пустой или повреждён.")
            source = roots[0]
            if cfg.get("subdir"):
                source = source / cfg["subdir"]
            if not (source / "plugin.json").exists():
                raise RuntimeError("В выбранной папке репозитория нет plugin.json. Проверьте subdir.")
            copied = _copy_tree(source, PLUGIN_DIR)
        return {"ok": True, "copied": copied, "repoUrl": cfg["repoUrl"], "branch": cfg["branch"], "subdir": cfg.get("subdir", "")}
