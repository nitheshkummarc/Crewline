"""Write a Contents list (each function and its one-line purpose) under the header of every source file.

Entries without a docstring (local test helpers) are left out.
Usage: uv run --project backend python backend/scripts/file_headers.py [--check]
The purpose of each entry is the first line of that function's own docstring or JSDoc,
so the list always matches the code. --check changes nothing and exits 1 if a header is out of date.

Contents:
    tracked: List tracked and new (not ignored) files under dirs with one of the given extensions.
    first_line: Return the first non-empty line of a docstring, or an empty string.
    entry_lines: Format name: purpose entries, wrapped at WIDTH with a hanging indent.
    py_entries: Top-level functions and classes, plus each class's methods, with their purposes.
    error_summary: Describe an error class by its `status, code, message = ...` line, as in core/errors.py.
    py_header: Return the file text with an up-to-date Contents section, or None when the file has no docstring.
    jsdoc_before: Return the first line of the /** */ comment that ends right above line i.
    js_header: Return the file text with an up-to-date Contents section, or None when the file has no header
        comment.
    main: Update or check the Contents section of every tracked source file.
"""

import argparse
import ast
import re
import subprocess
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PY_DIRS = ("backend/app", "backend/scripts", "backend/tests", "database")
JS_DIRS = ("frontend/src", "frontend/e2e", "frontend/scripts", "loadtest")
JS_EXT = (".ts", ".tsx", ".js", ".mjs")
WIDTH = 120
JS_FUNC = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+(\w+)"
    r"|^(?:export\s+)?class\s+(\w+)"
    r"|^(?:export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\(|<\w|\w+\s*=>|function\b|memo\(|forwardRef)"
)


def tracked(dirs: tuple[str, ...], exts: tuple[str, ...]) -> list[Path]:
    """List tracked and new (not ignored) files under dirs with one of the given extensions."""
    # New files count too, so a local --check before the first commit matches CI.
    cmd = ["git", "ls-files", "--cached", "--others", "--exclude-standard", *dirs]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [ROOT / p for p in out.split() if p.endswith(exts)]


def first_line(doc: str | None) -> str:
    """Return the first non-empty line of a docstring, or an empty string."""
    for line in (doc or "").strip().splitlines():
        if line.strip():
            return line.strip()
    return ""


def entry_lines(entries: list[tuple[str, str]], prefix: str) -> list[str]:
    """Format name: purpose entries, wrapped at WIDTH with a hanging indent."""
    lines: list[str] = []
    for name, purpose in entries:
        text = f"{name}: {purpose}" if purpose else name
        lines += textwrap.wrap(text, WIDTH - len(prefix) - 2, initial_indent=prefix + "  ",
                               subsequent_indent=prefix + "      ", break_on_hyphens=False)
    return lines


def py_entries(tree: ast.Module) -> list[tuple[str, str]]:
    """Top-level functions and classes, plus each class's methods, with their purposes."""
    entries: list[tuple[str, str]] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            entries.append((node.name, first_line(ast.get_docstring(node))))
        if isinstance(node, ast.ClassDef):
            entries.append((node.name, first_line(ast.get_docstring(node)) or error_summary(node)))
            for sub in node.body:
                # Constructors are skipped: their purpose is the class's.
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)) and not sub.name.startswith("__"):
                    entries.append((f"{node.name}.{sub.name}", first_line(ast.get_docstring(sub))))
    return [(name, purpose) for name, purpose in entries if purpose]


def error_summary(node: ast.ClassDef) -> str:
    """Describe an error class by its `status, code, message = ...` line, as in core/errors.py."""
    for stmt in node.body:
        if not isinstance(stmt, ast.Assign) or not isinstance(stmt.value, ast.Tuple):
            continue
        if isinstance(stmt.targets[0], ast.Tuple) and len(stmt.value.elts) == 3:
            names = [t.id for t in stmt.targets[0].elts if isinstance(t, ast.Name)]
            values = [v.value for v in stmt.value.elts if isinstance(v, ast.Constant)]
            if names == ["status", "code", "message"] and len(values) == 3:
                return f"{values[0]} {values[1]}: {values[2]}"
    return ""


def py_header(path: Path) -> str | None:
    """Return the file text with an up-to-date Contents section, or None when the file has no docstring."""
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    if not tree.body or not isinstance(tree.body[0], ast.Expr) or not isinstance(tree.body[0].value, ast.Constant) \
            or not isinstance(tree.body[0].value.value, str):
        return None
    node = tree.body[0]
    doc = node.value.value.split("\n\nContents:\n")[0].rstrip()  # type: ignore[attr-defined]
    entries = py_entries(tree)
    if entries:
        doc += "\n\nContents:\n" + "\n".join(entry_lines(entries, "  ")) + "\n"
    elif "\n" in doc:
        doc += "\n"
    literal = '"""' + doc.replace("\\", "\\\\").replace('"""', '\\"\\"\\"') + '"""'
    lines = src.split("\n")
    new = "\n".join(lines[: node.lineno - 1] + [literal] + lines[node.end_lineno:])  # type: ignore[operator]
    assert ast.get_docstring(ast.parse(new), clean=False) == doc, path
    return new


def jsdoc_before(lines: list[str], i: int) -> str:
    """Return the first line of the /** */ comment that ends right above line i."""
    j = i - 1
    if j < 0 or not lines[j].strip().endswith("*/"):
        return ""
    while j >= 0 and "/**" not in lines[j]:
        j -= 1
    if j < 0:
        return ""
    body = " ".join(lines[j:i]).replace("/**", "").replace("*/", "")
    body = re.sub(r"\s*\*\s+", " ", " " + body)
    return re.sub(r"\s+", " ", body).strip().split(" @")[0]


def js_header(path: Path) -> str | None:
    """Return the file text with an up-to-date Contents section, or None when the file has no header comment."""
    src = path.read_text(encoding="utf-8")
    lines = src.split("\n")
    if not lines or not lines[0].startswith("//"):
        return None
    end = 0
    while end < len(lines) and lines[end].startswith("//"):
        end += 1
    head = lines[:end]
    if "// Contents:" in head:
        cut = head.index("// Contents:")
        head = head[: cut - 1 if cut > 0 and head[cut - 1] == "//" else cut]
    entries = []
    for i, line in enumerate(lines[end:], start=end):
        m = JS_FUNC.match(line)
        purpose = jsdoc_before(lines, i) if m else ""
        if m and purpose:
            entries.append((next(g for g in m.groups() if g), purpose))
    if entries:
        head += ["//", "// Contents:"] + entry_lines(entries, "// ")
    return "\n".join(head + lines[end:])


def main() -> int:
    """Update or check the Contents section of every tracked source file."""
    parser = argparse.ArgumentParser(description="Write a Contents list under every source file header.")
    parser.add_argument("--check", action="store_true", help="exit 1 if any header is out of date; change nothing")
    args = parser.parse_args()
    stale, skipped = [], []
    files = [(p, py_header) for p in tracked(PY_DIRS, (".py",))] + [(p, js_header) for p in tracked(JS_DIRS, JS_EXT)]
    for path, build in files:
        new = build(path)
        rel = path.relative_to(ROOT).as_posix()
        if new is None:
            skipped.append(rel)
            continue
        if new != path.read_text(encoding="utf-8"):
            stale.append(rel)
            if not args.check:
                with open(path, "w", encoding="utf-8", newline="\n") as f:
                    f.write(new)
    for rel in skipped:
        print("no header comment, skipped:", rel)
    print(("out of date: " if args.check else "updated: ") + str(len(stale)), *stale, sep="\n  ")
    return 1 if args.check and stale else 0


if __name__ == "__main__":
    sys.exit(main())
