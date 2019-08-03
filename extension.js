// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const Helper = {}
const EXCLUDES = [
	'**/node_modules/**',
	'**/resources/**',
	'**/dist/**'
]

Helper.split = (text, sep) => {
	let results = []
	const parts = text.split('\n')
	parts.forEach((part) => {
		const seps = part.split(sep)
		seps.forEach((sepPart) => {
			const trimmed = sepPart.trim()
			if (trimmed && !trimmed.startsWith('//')) {
				results.push(sepPart)
			}
		})
	})

	return results
}

Helper.getText = (document, y, x, y0, x0) => {
	const startPosition = new vscode.Position(y, x)
	const endPosition = new vscode.Position(y0, x0)
	const text = document.getText(new vscode.Range(startPosition, endPosition))
	return text
}

Helper.removeCrLf = function (text) {
	return text.replace(/\r/g, '').replace(/\n/g, '')
}

Helper.getWordAtCursor = (document, selection) => {
	if (!selection.isSingleLine) {
		return null
	}

	const selectedText = document.getText(selection)
	if (selectedText) {
		return selectedText
	}

	const line = document.lineAt(selection.start.line).text
	const regex = /\w+/gm
	let x = selection.start.character
	let m = null
	while ((m = regex.exec(line)) !== null) {
		const text = m[0]
		if (x >= m.index && x <= (m.index + text.length)) {
			return text
		}
	}

	return null
}

Helper.search = (document, searchText, point) => {
	let x = point ? point.x : 0
	let y = point ? point.y : 0
	for (; y < document.lineCount; y++) {
		const text = document.lineAt(y).text
		const index = text.indexOf(searchText, x)
		if (index !== -1) {
			return { y, x: index }
		}
		x = 0
	}

	return null
}

Helper.getFiller = (parts) => {
	let filler = ''
	if (parts.length) {
		// Avoid comments
		for (let partIndex = 0; partIndex < parts.length; partIndex++) {
			if (!parts[partIndex].trim().startsWith('//')) {
				const trimmed = parts[partIndex].trim()
				const index = parts[partIndex].indexOf(trimmed)
				if (index > 0) {
					filler = Helper.removeCrLf(parts[partIndex].substring(0, index))
				}
				break
			}
		}
	}

	return filler
}

Helper.toLastCharacter = (document, point) => {
	let x = point.x
	let y = point.y
	let line = document.lineAt(y).text.substring(0, x)
	if (line.trim().length === 0) {
		line = document.lineAt(y - 1).text
		y -= 1
		x = line.length
	}

	return { y, x }
}

Helper.getDefines = (document) => {
	let point = Helper.search(document, 'sap.ui.define')
	if (!point) {
		return null
	}

	point = Helper.search(document, '[', point)
	if (!point) {
		return null
	}

	let importPoint = Helper.search(document, ']', point)
	if (!importPoint) {
		return null
	}

	importPoint = Helper.toLastCharacter(document, importPoint)

	let text = Helper.getText(document, point.y, point.x + 1, importPoint.y, importPoint.x)
	const imports = Helper.split(text, ',')
	const importFiller = Helper.getFiller(imports)

	point = Helper.search(document, 'function', importPoint)
	if (!point) {
		return null
	}

	point = Helper.search(document, '(', point)
	if (!point) {
		return null
	}

	let parensPoint = Helper.search(document, ')', point)
	if (!parensPoint) {
		return null
	}

	parensPoint = Helper.toLastCharacter(document, parensPoint)

	text = Helper.getText(document, point.y, point.x + 1, parensPoint.y, parensPoint.x)

	let parameters = Helper.split(text, ',')
	const filler = Helper.getFiller(parameters)

	return {
		importPoint,
		parensPoint,
		parameters: parameters.map((parameter) => parameter.trim()),
		importFiller,
		filler
	}
}

Helper.findImport = (document, editor, word) => {
	const defineInfos = Helper.getDefines(document)
	if (!defineInfos) {
		vscode.window.showInformationMessage('Cannot locate define section!')
		return null
	}


	// Find if already defined
	const found = defineInfos.parameters.some((parameter) => parameter.toLowerCase().endsWith(word.toLowerCase()))
	if (found) {
		return false
	}

	const glob = `**/${word}.js`
	//const glob = '**/test.txt'
	vscode.workspace.findFiles(glob, EXCLUDES, 10)
	.then((result) => {
		let message = null
		if (result.length === 0) {
			message = `"${word}.js" as not been found in the workspace file system!`
		} else if( result.length > 1) {
			message = `Too much results for "${word}.js" (${result.length})`
		} else {
			let fileName = new String(result[0].fsPath)
			let index = fileName.lastIndexOf('.')
			if (index !== -1) {
				fileName = fileName.substring(0, index)
			}
			index = fileName.indexOf(':')
			if (index !== -1) {
				fileName = fileName.substring(index + 1)
			}

			message = `${word} - ${fileName} has been added into the define section`

			editor.edit((editBuilder) => {
				let parameter = word
				// Replace \ by /
				let importText = `\'${fileName}\'`.replace(/\\/g, '/')
				if (defineInfos.parameters.length) {
					importText = `,\n${defineInfos.importFiller}${importText}`
					parameter = `,\n${defineInfos.filler}${parameter}`
				}
				// Insert import line
				const position = new vscode.Position(defineInfos.importPoint.y, defineInfos.importPoint.x)
				editBuilder.insert(position, importText)
				// Insert new function() parameter
				const parameterPosition = new vscode.Position(defineInfos.parensPoint.y, defineInfos.parensPoint.x)
				editBuilder.insert(parameterPosition, parameter)
			})
		}

		vscode.window.showInformationMessage(message)
	})
}


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "wiseimport" is now active!');

	let disposable = vscode.commands.registerCommand('extension.wiseimport', function () {
		// Get the active text editor
		let editor = vscode.window.activeTextEditor;

		if (editor) {
			let document = editor.document;
			let selection = editor.selection;

			// Get the word within the selection
			let word = Helper.getWordAtCursor(document, selection)
			console.log('Word', word)
			if (word) {
				Helper.findImport(document, editor, word)
			}

			// editor.edit((editBuilder) => {
			// 	const position = new vscode.Position(0, 0)
			// 	editBuilder.insert(position, 'test')
			// })
		}
	});

	context.subscriptions.push(disposable);
}


exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
