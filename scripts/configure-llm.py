"""Configure a server-only key from a hidden prompt; never print credentials."""
import getpass
import re
import warnings
from pathlib import Path

import httpx

warnings.simplefilter("error", getpass.GetPassWarning)
key = getpass.getpass("OpenAI API key (hidden): ").strip()
if not key.startswith("sk-") or len(key) < 30 or any(c.isspace() for c in key):
    raise SystemExit("Key format is invalid.")
try:
    with httpx.Client(timeout=20) as client:
        response = client.get("https://api.openai.com/v1/models/gpt-5.4-mini",
                              headers={"Authorization": "Bearer " + key})
    status = response.status_code
    if status != 200:
        code = str(response.json().get("error", {}).get("code", "unknown"))
        code = code if re.fullmatch(r"[a-zA-Z0-9_\-]+", code) else "redacted"
        raise SystemExit(f"OpenAI credential check failed: HTTP {status}, code={code}")
except httpx.HTTPError:
    raise SystemExit("OpenAI credential check could not connect.")
root = Path(__file__).resolve().parents[1]
path = root / ".env"
text = path.read_text(encoding="utf-8-sig") if path.exists() else ""
values = {"LLM_PROVIDER": "openai", "LLM_MODEL": "gpt-5.4-mini", "LLM_API_KEY": key}
lines = []
written = set()
for line in text.splitlines():
    name = line.partition("=")[0].strip()
    if name in values:
        if name not in written:
            lines.append(name + "=" + values[name])
            written.add(name)
    else:
        lines.append(line)
for name, value in values.items():
    if name not in written:
        lines.append(name + "=" + value)
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
key = None
print("Server .env configured: provider=openai, model=gpt-5.4-mini. Key is not displayed.")
