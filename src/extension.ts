import * as vscode from 'vscode';
import { parseDSL } from './dsl/parser';
import { layoutDiagram } from './dsl/layout';
import { getWebviewHtml } from './webview/getWebviewHtml';

let panel: vscode.WebviewPanel | undefined;
let lastSourceDoc: vscode.TextDocument | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
	const openCommand = vscode.commands.registerCommand('bullshit.openPanel', () => {
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
				}
			});
		}

		if (vscode.window.activeTextEditor) {
			lastSourceDoc = vscode.window.activeTextEditor.document;
		}
		renderCurrentSource();
	});

	context.subscriptions.push(openCommand);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor && editor.document.uri.scheme === 'file') {
				lastSourceDoc = editor.document;
				renderCurrentSource();
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

	panel.webview.postMessage({
		type: 'update',
		fileName: lastSourceDoc.fileName.split(/[\\/]/).pop(),
		model: positioned,
	});
}

export function deactivate() {}
