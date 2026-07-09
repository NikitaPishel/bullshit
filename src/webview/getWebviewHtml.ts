import * as vscode from 'vscode';

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const nonce = getNonce();
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'style.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'));
	const csp = [
		`default-src 'none'`,
		`img-src ${webview.cspSource} data: blob:`,
		`style-src ${webview.cspSource}`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Diagram</title>
	<link rel="stylesheet" href="${styleUri}" />
</head>
<body>
	<div id="toolbar">
		<span class="dot"></span>
		<span id="toolbar-title">no source</span>
		<span class="spacer"></span>
		<button id="export-svg">Export SVG</button>
		<button id="export-png">Export PNG</button>
		<button id="zoom-in">+</button>
		<button id="zoom-out">–</button>
		<button id="zoom-reset">reset</button>
	</div>
	<div id="stage">
		<div id="viewport">
			<svg id="edges"></svg>
			<div id="nodes"></div>
		</div>
		<div id="empty">Open the DSL file.</div>
		<div id="error"></div>
	</div>

	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
