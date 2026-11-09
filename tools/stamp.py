"""Versioniert die Module in index.html (Cache-Busting für GitHub Pages).

GitHub Pages liefert Dateien mit max-age=600 aus. Ohne Version kann der Browser eine neue index.html mit
alten Modulen mischen. Die Import-Map bildet jedes Modul auf seine URL mit Inhalts-Hash ab
(./src/x.js -> ./src/x.js?v=<hash>); relative Imports zwischen den Modulen laufen ebenfalls darüber.
Vor jedem Commit laufen lassen: task stamp
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
html_path = ROOT / "index.html"
html = html_path.read_text(encoding="utf-8")

m = re.search(r'(<script type="importmap">\s*)(\{.*?\})(\s*</script>)', html, re.S)
imap = json.loads(m.group(2))
imports = {k: v for k, v in imap["imports"].items() if not k.startswith("./src/")}
for f in sorted((ROOT / "src").glob("*.js")):
    h = hashlib.sha256(f.read_bytes()).hexdigest()[:10]
    imports[f"./src/{f.name}"] = f"./src/{f.name}?v={h}"
new = json.dumps({"imports": imports}, indent=2, ensure_ascii=False)
out = html[: m.start(2)] + new + html[m.end(2):]
if out != html:
    html_path.write_text(out, encoding="utf-8")
    print("index.html: Modulversionen aktualisiert")
