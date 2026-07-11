# apis-engine

**Apis** is the engine: a VS Code extension that renders **Beelang** — a
custom lightweight diagram DSL — as a live, draggable node-and-edge diagram
directly inside the editor. No external services (no Mermaid, no PlantUML).
Parsing and layout (via [dagre](https://github.com/dagrejs/dagre)) happen
entirely inside the extension.

Beelang source files use the `.bee` file extension.

## Features

- Open a live preview of a diagram written in Beelang via the
  **Diagram: Open Preview** command.
- Nodes and edges are laid out automatically and can be dragged around in the
  preview panel.
- Works on plain text/Markdown files as well as `.bee` files — just write the
  DSL and preview it.

See [DSL_GUIDE.md](DSL_GUIDE.md) for the full Beelang syntax reference and
example prompts for generating diagrams with an AI assistant.

## Usage

1. Open a `.bee` file (or any text file) containing diagram source written in
   Beelang.
2. Run the **Diagram: Open Preview** command from the Command Palette
   (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3. The rendered diagram opens in a side panel and updates as you edit the
   source file.

## Requirements

No external dependencies or services are required.

## Known Issues

None currently tracked.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## Authors

- [Nikita Pishel](https://github.com/NikitaPishel)
- [Illia Stavitskiy](https://github.com/illiastv)
