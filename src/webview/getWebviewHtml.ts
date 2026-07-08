import * as vscode from 'vscode';

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function getWebviewHtml(webview: vscode.Webview): string {
	const nonce = getNonce();
	const csp = [
		`default-src 'none'`,
		`img-src ${webview.cspSource} data:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Diagram</title>
	<style>
		:root {
			--bg: #0b1615;
			--bg-dots: #12211f;
			--panel: #0f201f;
			--node-bg: #123634;
			--node-header: #17423f;
			--border: #1f5854;
			--teal: #2dd4bf;
			--teal-dim: #1f9d8c;
			--text: #dff7f2;
			--text-dim: #8fb8b2;
			--empty: #6f9791;
		}
		* { box-sizing: border-box; }
		html, body {
			margin: 0;
			padding: 0;
			width: 100%;
			height: 100%;
			background: var(--bg);
			background-image: radial-gradient(var(--bg-dots) 1px, transparent 1px);
			background-size: 22px 22px;
			color: var(--text);
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			overflow: hidden;
		}
		#toolbar {
			position: fixed;
			top: 0; left: 0; right: 0;
			height: 40px;
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 0 14px;
			background: rgba(15, 32, 31, 0.9);
			border-bottom: 1px solid var(--border);
			backdrop-filter: blur(6px);
			z-index: 10;
			font-size: 12px;
			color: var(--text-dim);
		}
		#toolbar .dot {
			width: 7px; height: 7px; border-radius: 50%;
			background: var(--teal);
			box-shadow: 0 0 8px var(--teal);
		}
		#toolbar button {
			background: transparent;
			border: 1px solid var(--border);
			color: var(--text-dim);
			border-radius: 5px;
			padding: 3px 9px;
			font-size: 11px;
			cursor: pointer;
		}
		#toolbar button:hover { color: var(--text); border-color: var(--teal-dim); }
		#stage {
			position: absolute;
			top: 40px; left: 0; right: 0; bottom: 0;
			overflow: hidden;
			cursor: grab;
		}
		#stage.panning { cursor: grabbing; }
		#viewport {
			position: absolute;
			top: 0; left: 0;
			transform-origin: 0 0;
		}
		#edges {
			position: absolute;
			top: 0; left: 0;
			overflow: visible;
			pointer-events: none;
		}
		.node {
			position: absolute;
			background: var(--node-bg);
			border: 1px solid var(--border);
			border-radius: 8px;
			box-shadow: 0 6px 18px rgba(0,0,0,0.35);
			overflow: hidden;
			user-select: none;
		}
		.node .head {
			background: var(--node-header);
			padding: 7px 10px;
			font-size: 12.5px;
			font-weight: 600;
			color: var(--text);
			cursor: grab;
			border-bottom: 1px solid var(--border);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.node .head:active { cursor: grabbing; }
		.node .body {
			padding: 8px 10px;
			font-size: 11.5px;
			line-height: 18px;
			color: var(--text-dim);
		}
		.node .field-title {
			color: var(--text);
			font-weight: 600;
			margin-top: 4px;
		}
		.node .field-title:first-child { margin-top: 0; }
		.node .item {
			padding-left: 10px;
			position: relative;
		}
		.node .item::before {
			content: '–';
			position: absolute;
			left: 0;
			color: var(--teal-dim);
		}
		.node.id-only .body { display: none; }
		.edge-label {
			fill: var(--text-dim);
			font-size: 10.5px;
		}
		.edge-label-bg {
			fill: var(--panel);
			opacity: 0.9;
		}
		#empty {
			position: absolute;
			top: 50%; left: 50%;
			transform: translate(-50%, -50%);
			color: var(--empty);
			font-size: 13px;
			text-align: center;
			max-width: 360px;
		}
	</style>
</head>
<body>
	<div id="toolbar">
		<span class="dot"></span>
		<span id="toolbar-title">no source</span>
		<button id="zoom-in">+</button>
		<button id="zoom-out">–</button>
		<button id="zoom-reset">reset</button>
	</div>
	<div id="stage">
		<div id="viewport">
			<svg id="edges"></svg>
			<div id="nodes"></div>
		</div>
		<div id="empty">Открой текстовый файл со схемой (DSL) и сохрани, чтобы увидеть диаграмму.</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const stage = document.getElementById('stage');
		const viewport = document.getElementById('viewport');
		const edgesSvg = document.getElementById('edges');
		const nodesLayer = document.getElementById('nodes');
		const emptyEl = document.getElementById('empty');
		const titleEl = document.getElementById('toolbar-title');

		let scale = 1;
		let panX = 40;
		let panY = 20;
		let nodesById = new Map();
		let currentEdges = [];

		function applyTransform() {
			viewport.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
		}
		applyTransform();

		document.getElementById('zoom-in').addEventListener('click', () => { scale = Math.min(2.5, scale + 0.15); applyTransform(); });
		document.getElementById('zoom-out').addEventListener('click', () => { scale = Math.max(0.3, scale - 0.15); applyTransform(); });
		document.getElementById('zoom-reset').addEventListener('click', () => { scale = 1; panX = 40; panY = 20; applyTransform(); });

		stage.addEventListener('wheel', (e) => {
			e.preventDefault();
			const delta = -e.deltaY * 0.001;
			scale = Math.min(2.5, Math.max(0.25, scale + delta));
			applyTransform();
		}, { passive: false });

		let panning = false;
		let panStart = { x: 0, y: 0 };
		let panOrigin = { x: 0, y: 0 };
		stage.addEventListener('mousedown', (e) => {
			if (e.target !== stage && e.target !== viewport) { return; }
			panning = true;
			stage.classList.add('panning');
			panStart = { x: e.clientX, y: e.clientY };
			panOrigin = { x: panX, y: panY };
		});
		window.addEventListener('mousemove', (e) => {
			if (!panning) { return; }
			panX = panOrigin.x + (e.clientX - panStart.x);
			panY = panOrigin.y + (e.clientY - panStart.y);
			applyTransform();
		});
		window.addEventListener('mouseup', () => { panning = false; stage.classList.remove('panning'); });

		function escapeHtml(s) {
			return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}

		function renderNodeContent(node) {
			const title = node.fields[0] ? node.fields[0].title : node.id;
			const bodyFields = node.fields.slice(1);
			let bodyHtml = '';
			for (const field of bodyFields) {
				bodyHtml += '<div class="field-title">' + escapeHtml(field.title) + '</div>';
				for (const item of field.items) {
					bodyHtml += '<div class="item">' + escapeHtml(item) + '</div>';
				}
			}
			return {
				title: escapeHtml(title),
				body: bodyHtml,
				hasBody: bodyFields.length > 0,
			};
		}

		function edgeAnchors(a, b) {
			// simple left-to-right anchor: right-center of a -> left-center of b
			if (b.x >= a.x + a.width * 0.5) {
				return {
					x1: a.x + a.width, y1: a.y + a.height / 2,
					x2: b.x, y2: b.y + b.height / 2,
				};
			} else if (b.x + b.width <= a.x + a.width * 0.5) {
				return {
					x1: a.x, y1: a.y + a.height / 2,
					x2: b.x + b.width, y2: b.y + b.height / 2,
				};
			}
			return {
				x1: a.x + a.width / 2, y1: a.y + (b.y > a.y ? a.height : 0),
				x2: b.x + b.width / 2, y2: b.y + (b.y > a.y ? 0 : b.height),
			};
		}

		function redrawEdges() {
			let svg = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
				'<path d="M0,0 L10,5 L0,10 z" fill="var(--teal-dim)" /></marker></defs>';

			for (const edge of currentEdges) {
				const a = nodesById.get(edge.from);
				const b = nodesById.get(edge.to);
				if (!a || !b) { continue; }
				const p = edgeAnchors(a, b);
				const mx = (p.x1 + p.x2) / 2;
				const c1x = p.x1 + (mx - p.x1) * 0.6;
				const c2x = p.x2 - (p.x2 - mx) * 0.6;
				const path = 'M ' + p.x1 + ' ' + p.y1 + ' C ' + c1x + ' ' + p.y1 + ', ' + c2x + ' ' + p.y2 + ', ' + p.x2 + ' ' + p.y2;
				svg += '<path d="' + path + '" fill="none" stroke="var(--teal-dim)" stroke-width="1.6" marker-end="url(#arrow)" opacity="0.85" />';

				if (edge.label) {
					const lx = (p.x1 + p.x2) / 2;
					const ly = (p.y1 + p.y2) / 2;
					const w = Math.min(220, edge.label.length * 6 + 12);
					svg += '<rect class="edge-label-bg" x="' + (lx - w / 2) + '" y="' + (ly - 9) + '" width="' + w + '" height="16" rx="4"></rect>';
					svg += '<text class="edge-label" x="' + lx + '" y="' + (ly + 3) + '" text-anchor="middle">' + escapeHtml(edge.label) + '</text>';
				}
			}
			edgesSvg.innerHTML = svg;
		}

		function makeDraggable(el, node) {
			const head = el.querySelector('.head');
			let dragging = false;
			let start = { x: 0, y: 0 };
			let origin = { x: 0, y: 0 };

			head.addEventListener('mousedown', (e) => {
				e.stopPropagation();
				dragging = true;
				start = { x: e.clientX, y: e.clientY };
				origin = { x: node.x, y: node.y };
			});
			window.addEventListener('mousemove', (e) => {
				if (!dragging) { return; }
				const dx = (e.clientX - start.x) / scale;
				const dy = (e.clientY - start.y) / scale;
				node.x = origin.x + dx;
				node.y = origin.y + dy;
				el.style.left = node.x + 'px';
				el.style.top = node.y + 'px';
				redrawEdges();
			});
			window.addEventListener('mouseup', () => {
				if (dragging) {
					dragging = false;
					vscode.postMessage({ type: 'move', id: node.id, x: node.x, y: node.y });
				}
			});
		}

		function render(model) {
			currentEdges = model.edges;
			nodesById = new Map();
			nodesLayer.innerHTML = '';
			emptyEl.style.display = model.nodes.length ? 'none' : 'block';

			edgesSvg.setAttribute('width', Math.max(model.width, 200));
			edgesSvg.setAttribute('height', Math.max(model.height, 200));
			viewport.style.width = Math.max(model.width, 200) + 'px';
			viewport.style.height = Math.max(model.height, 200) + 'px';

			for (const node of model.nodes) {
				nodesById.set(node.id, node);
				const content = renderNodeContent(node);
				const el = document.createElement('div');
				el.className = 'node' + (content.hasBody ? '' : ' id-only');
				el.style.left = node.x + 'px';
				el.style.top = node.y + 'px';
				el.style.width = node.width + 'px';
				el.style.minHeight = node.height + 'px';
				el.innerHTML = '<div class="head">' + content.title + '</div><div class="body">' + content.body + '</div>';
				nodesLayer.appendChild(el);
				makeDraggable(el, node);
			}

			redrawEdges();
		}

		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (msg.type === 'update') {
				titleEl.textContent = msg.fileName || 'diagram';
				render(msg.model);
			}
		});

		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
}
