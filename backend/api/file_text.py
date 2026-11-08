import re
import zipfile
from io import BytesIO
from xml.etree import ElementTree

from pypdf import PdfReader


class UnsupportedFile(Exception):
    pass


TEXT_EXTENSIONS = {
    "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "html", "htm", "css", "log", "ini", "toml", "sql",
    "py", "js", "ts", "jsx", "tsx", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "sh",
}
DOC_EXTENSIONS = {"pdf", "docx"} | TEXT_EXTENSIONS

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def extension(filename:str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


# Only as much text as the prompt can take is extracted, so a 2000-page PDF doesn't tie up a worker thread.
MAX_PAGES = 150
MAX_CHARS = 40000
MAX_XML_SIZE = 30 * 1024 * 1024   # unpacked word/document.xml; a bigger one is a zip bomb, not a document


def _pdf_text(data:bytes) -> str:
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:
            raise UnsupportedFile("Protected PDF")
    parts, size = [], 0
    for page in reader.pages[:MAX_PAGES]:
        text = (page.extract_text() or "").strip()
        parts.append(text)
        size += len(text)
        if size >= MAX_CHARS:
            break
    return "\n\n".join(parts)


def _docx_text(data:bytes) -> str:
    # A .docx is a zip; the body text lives in word/document.xml, one <w:p> per paragraph.
    with zipfile.ZipFile(BytesIO(data)) as z:
        if z.getinfo("word/document.xml").file_size > MAX_XML_SIZE:
            raise UnsupportedFile("Document is too large")
        root = ElementTree.fromstring(z.read("word/document.xml"))
    paragraphs = []
    for p in root.iter(f"{_W}p"):
        paragraphs.append("".join(t.text or "" for t in p.iter(f"{_W}t")))
    return "\n".join(paragraphs)


def _plain_text(data:bytes) -> str:
    for encoding in ("utf-8-sig", "cp1251"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnsupportedFile("Unknown encoding")


def extract_text(data:bytes, filename:str) -> str:
    """Text of a PDF, Word (.docx) or plain-text file. CPU-bound, so call it with asyncio.to_thread."""
    ext = extension(filename)
    try:
        if ext == "pdf":
            text = _pdf_text(data)
        elif ext == "docx":
            text = _docx_text(data)
        elif ext in TEXT_EXTENSIONS:
            text = _plain_text(data)
        else:
            raise UnsupportedFile("Unsupported file type")
    except UnsupportedFile:
        raise
    except Exception:
        raise UnsupportedFile("Couldn't read the file")
    # Collapse the runs of blank lines PDFs are full of.
    return re.sub(r"\n{3,}", "\n\n", text.replace("\x00", "")).strip()
