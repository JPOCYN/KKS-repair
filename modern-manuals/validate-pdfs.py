import json
import sys
from pathlib import Path
from urllib.parse import unquote

from pypdf import PdfReader


directory = Path(__file__).resolve().parent
manifest_path = directory / "pdf-manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
errors = []
encrypted = 0
total_pages = 0
validated_bytes = 0
seen_paths = set()

for index, record in enumerate(manifest.get("files", []), start=1):
    relative_path = unquote(record["path"].removeprefix("./"))
    pdf_path = (directory / relative_path).resolve()

    if directory not in pdf_path.parents:
        errors.append({"path": relative_path, "error": "Path escapes modern-manuals"})
        continue
    if pdf_path in seen_paths:
        errors.append({"path": relative_path, "error": "Duplicate manifest path"})
        continue
    seen_paths.add(pdf_path)
    if not pdf_path.is_file():
        errors.append({"path": relative_path, "error": "File is missing"})
        continue

    size = pdf_path.stat().st_size
    if size != int(record["bytes"]):
        errors.append({"path": relative_path, "error": f"Size mismatch: {size} != {record['bytes']}"})
        continue
    with pdf_path.open("rb") as stream:
        signature = stream.read(5)
    if signature != b"%PDF-":
        errors.append({"path": relative_path, "error": "Invalid PDF signature"})
        continue

    try:
        reader = PdfReader(str(pdf_path), strict=False)
        if reader.is_encrypted:
            encrypted += 1
            if reader.decrypt("") == 0:
                errors.append({"path": relative_path, "error": "Password-protected PDF cannot be opened"})
                continue
        page_count = len(reader.pages)
        if page_count < 1:
            errors.append({"path": relative_path, "error": "PDF contains no pages"})
            continue
        total_pages += page_count
        validated_bytes += size
    except Exception as error:  # noqa: BLE001 - validation must report every source failure.
        errors.append({"path": relative_path, "error": str(error)})

    if index % 100 == 0:
        print(json.dumps({"validated": index, "total": len(manifest.get('files', [])), "errors": len(errors)}), flush=True)

result = {
    "status": "passed" if not errors else "failed",
    "referenced": manifest.get("referenced", 0),
    "files": len(manifest.get("files", [])),
    "uniqueFiles": len(seen_paths),
    "totalPages": total_pages,
    "totalBytes": validated_bytes,
    "encryptedFiles": encrypted,
    "errors": errors[:50],
}
print(json.dumps(result, indent=2), flush=True)
if errors:
    sys.exit(1)
