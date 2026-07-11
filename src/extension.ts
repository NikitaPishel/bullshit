import * as vscode from 'vscode';
import { DiagramSyntaxError, parseDSL } from './dsl/parser';
import { layoutDiagram } from './dsl/layout';
import { PositionedDiagram } from './dsl/model';
import { getWebviewHtml } from './webview/getWebviewHtml';

interface LayoutEntry {
	id: string;
	index: number | null;
	x: number;
	y: number;
}

const EMPTY_MODEL: PositionedDiagram = { type: 'structure', title: '', blocks: [], edges: [], width: 0, height: 0 };

let panel: vscode.WebviewPanel | undefined;
let lastSourceDoc: vscode.TextDocument | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

let layoutOverrides = new Map<string, LayoutEntry>();
let layoutUri: vscode.Uri | undefined;

function entryKey(id: string, index: number | null): string {
	return index === null ? id : `${id}#${index}`;
}

export function activate(context: vscode.ExtensionContext) {
	const openCommand = vscode.commands.registerCommand('apis-engine.openPanel', async () => {
		if (panel) {
			panel.reveal(vscode.ViewColumn.Beside);
		} else {
			panel = vscode.window.createWebviewPanel(
				'apisEnginePanel',
				'Diagram',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
				}
			);
			panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

			panel.onDidDispose(() => {
				panel = undefined;
			});

			panel.webview.onDidReceiveMessage((msg) => {
				if (msg?.type === 'ready') {
					renderCurrentSource();
					return;
				}
				if (msg?.type === 'move' && typeof msg.id === 'string') {
					const index = typeof msg.index === 'number' ? msg.index : null;
					layoutOverrides.set(entryKey(msg.id, index), { id: msg.id, index, x: msg.x, y: msg.y });
					void saveLayoutOverrides();
					return;
				}
				if (msg?.type === 'export' && (msg.format === 'svg' || msg.format === 'png') && typeof msg.data === 'string') {
					void exportDiagram(msg.format, msg.data);
					return;
				}
				if (msg?.type === 'export-error' && typeof msg.message === 'string') {
					vscode.window.showErrorMessage(msg.message);
				}
			});
		}

		const editor = vscode.window.activeTextEditor;
		if (editor && isDiagramSource(editor.document)) {
			await setSource(editor.document);
		} else {
			renderCurrentSource();
		}
	});

	context.subscriptions.push(openCommand);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(async (editor) => {
			if (editor && isDiagramSource(editor.document)) {
				await setSource(editor.document);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (lastSourceDoc && e.document.uri.toString() === lastSourceDoc.uri.toString()) {
				scheduleRender();
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((doc) => {
			if (lastSourceDoc && doc.uri.toString() === lastSourceDoc.uri.toString()) {
				renderCurrentSource();
			}
		})
	);
}

function isDiagramSource(doc: vscode.TextDocument): boolean {
	return doc.uri.scheme === 'file' && !doc.fileName.endsWith('.layout.json');
}

async function setSource(doc: vscode.TextDocument) {
	lastSourceDoc = doc;
	await loadLayoutOverrides(doc);
	renderCurrentSource();
}

function getLayoutUri(doc: vscode.TextDocument): vscode.Uri {
	return vscode.Uri.file(doc.uri.fsPath + '.layout.json');
}

/** Legacy sidecar format was a flat { [blockId]: {x,y} } map; every entry becomes an index-less (structure) block. */
function migrateLegacyLayout(parsed: unknown): LayoutEntry[] {
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return [];
	}
	const entries: LayoutEntry[] = [];
	for (const [id, pos] of Object.entries(parsed as Record<string, { x?: unknown; y?: unknown }>)) {
		if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
			entries.push({ id, index: null, x: pos.x, y: pos.y });
		}
	}
	return entries;
}

async function loadLayoutOverrides(doc: vscode.TextDocument): Promise<void> {
	layoutUri = getLayoutUri(doc);
	layoutOverrides = new Map();
	try {
		const bytes = await vscode.workspace.fs.readFile(layoutUri);
		const parsed = JSON.parse(new TextDecoder().decode(bytes));
		const entries: LayoutEntry[] = Array.isArray(parsed?.positions) ? parsed.positions : migrateLegacyLayout(parsed);
		for (const entry of entries) {
			if (typeof entry?.id === 'string' && typeof entry?.x === 'number' && typeof entry?.y === 'number') {
				const index = typeof entry.index === 'number' ? entry.index : null;
				layoutOverrides.set(entryKey(entry.id, index), { id: entry.id, index, x: entry.x, y: entry.y });
			}
		}
	} catch {
		layoutOverrides = new Map();
	}
}

async function saveLayoutOverrides(): Promise<void> {
	if (!layoutUri) {
		return;
	}
	const payload = { version: 2, positions: Array.from(layoutOverrides.values()) };
	const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2) + '\n');
	try {
		await vscode.workspace.fs.writeFile(layoutUri, bytes);
	} catch {
		// best-effort persistence; ignore write failures (e.g. read-only fs)
	}
}

function scheduleRender() {
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
	debounceTimer = setTimeout(renderCurrentSource, 250);
}

function renderCurrentSource() {
	if (!panel) {
		return;
	}
	if (!lastSourceDoc) {
		panel.webview.postMessage({ type: 'update', fileName: '', error: null, model: EMPTY_MODEL });
		return;
	}

	const fileName = lastSourceDoc.fileName.split(/[\\/]/).pop();
	const text = lastSourceDoc.getText();

	try {
		const parsed = parseDSL(text);
		const positioned = layoutDiagram(parsed);

		for (const block of positioned.blocks) {
			const override = layoutOverrides.get(entryKey(block.id, block.index));
			if (override) {
				block.x = override.x;
				block.y = override.y;
			}
		}

		let maxX = 0;
		let maxY = 0;
		for (const block of positioned.blocks) {
			maxX = Math.max(maxX, block.x + block.width);
			maxY = Math.max(maxY, block.y + block.height);
		}
		positioned.width = Math.max(positioned.width, maxX + 60);
		positioned.height = Math.max(positioned.height, maxY + 60);

		panel.webview.postMessage({ type: 'update', fileName, error: null, model: positioned });
	} catch (err) {
		const message = err instanceof DiagramSyntaxError ? err.message : `Failed to parse diagram: ${String(err)}`;
		panel.webview.postMessage({ type: 'update', fileName, error: message, model: EMPTY_MODEL });
	}
}

function defaultExportUri(format: 'svg' | 'png'): vscode.Uri | undefined {
	if (!lastSourceDoc) {
		return undefined;
	}
	const base = lastSourceDoc.uri.fsPath.replace(/\.[^./\\]+$/, '');
	return vscode.Uri.file(base + '.' + format);
}

async function exportDiagram(format: 'svg' | 'png', data: string): Promise<void> {
	const uri = await vscode.window.showSaveDialog({
		defaultUri: defaultExportUri(format),
		filters: format === 'svg' ? { 'SVG Image': ['svg'] } : { 'PNG Image': ['png'] },
	});
	if (!uri) {
		return;
	}

	const bytes = format === 'svg' ? new TextEncoder().encode(data) : Buffer.from(data, 'base64');

	try {
		await vscode.workspace.fs.writeFile(uri, bytes);
		vscode.window.showInformationMessage('Diagram exported: ' + uri.fsPath);
	} catch (err) {
		vscode.window.showErrorMessage('Failed to export diagram: ' + String(err));
	}
}

export function deactivate() {}
