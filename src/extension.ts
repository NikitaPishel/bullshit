import * as vscode from 'vscode';
import { parseDSL } from './dsl/parser';
import { layoutDiagram } from './dsl/layout';
import { getWebviewHtml } from './webview/getWebviewHtml';

interface LayoutPosition {
	x: number;
	y: number;
}

let panel: vscode.WebviewPanel | undefined;
let lastSourceDoc: vscode.TextDocument | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

let layoutOverrides: Record<string, LayoutPosition> = {};
let layoutUri: vscode.Uri | undefined;

export function activate(context: vscode.ExtensionContext) {
	const openCommand = vscode.commands.registerCommand('bullshit.openPanel', async () => {
		if (panel) {
			panel.reveal(vscode.ViewColumn.Beside);
		} else {
			panel = vscode.window.createWebviewPanel(
				'bullshitPanel',
				'Diagram',
				vscode.ViewColumn.Beside,
				{ enableScripts: true, retainContextWhenHidden: true }
			);
			panel.webview.html = getWebviewHtml(panel.webview);

			panel.onDidDispose(() => {
				panel = undefined;
			});

			panel.webview.onDidReceiveMessage((msg) => {
				if (msg?.type === 'ready') {
					renderCurrentSource();
					return;
				}
				if (msg?.type === 'move' && typeof msg.id === 'string') {
					layoutOverrides[msg.id] = { x: msg.x, y: msg.y };
					void saveLayoutOverrides();
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

async function loadLayoutOverrides(doc: vscode.TextDocument): Promise<void> {
	layoutUri = getLayoutUri(doc);
	try {
		const bytes = await vscode.workspace.fs.readFile(layoutUri);
		layoutOverrides = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		layoutOverrides = {};
	}
}

async function saveLayoutOverrides(): Promise<void> {
	if (!layoutUri) {
		return;
	}
	const bytes = new TextEncoder().encode(JSON.stringify(layoutOverrides, null, 2) + '\n');
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
		panel.webview.postMessage({
			type: 'update',
			fileName: '',
			model: { nodes: [], edges: [], width: 0, height: 0 },
		});
		return;
	}

	const text = lastSourceDoc.getText();
	const parsed = parseDSL(text);
	const positioned = layoutDiagram(parsed);

	for (const node of positioned.nodes) {
		const override = layoutOverrides[node.id];
		if (override) {
			node.x = override.x;
			node.y = override.y;
		}
	}

	let maxX = 0;
	let maxY = 0;
	for (const node of positioned.nodes) {
		maxX = Math.max(maxX, node.x + node.width);
		maxY = Math.max(maxY, node.y + node.height);
	}
	positioned.width = Math.max(positioned.width, maxX + 60);
	positioned.height = Math.max(positioned.height, maxY + 60);

	panel.webview.postMessage({
		type: 'update',
		fileName: lastSourceDoc.fileName.split(/[\\/]/).pop(),
		model: positioned,
	});
}

export function deactivate() {}
