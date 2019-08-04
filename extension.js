// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const Helper = {}
const EXCLUDES = [
	'/node_modules/',
	'/resources/',
	'/dist/'
]

const Winners = {
	SAPUI5: {
		text: '/sap/m/',
		prefix: ''
	},
	SAP_BI_WEBI: {
		text: '/sap/bi/webi/',
		prefix: ''
	},
	WEBAPP: {
		text: '/webapp/',
		deleteText: true,
		prefix: 'sap/bi/webi/'
	}
}

const HARD_CODED = {
	ActionDispatcher: 'sap/bi/smart/core/action/ActionDispatcher',
  ActionRegistry: 'sap/bi/smart/core/action/ActionRegistry',
	StoreRegistry: 'sap/bi/smart/core/store/StoreRegistry',
	Logger: 'sap/bi/smart/core/Logger'
}

Helper.processFile = (editor, defineInfos, fileName, word) => {
	let message = null
	if (!fileName) {
		message = `"${word}.js" not found in the workspace file system!`
	} else {
		message = `${fileName} has been added into the define section`
		editor.edit((editBuilder) => {
			let parameter = word
			let importText = `\'${fileName}\'`
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
}

Helper.findWinner = (files, winner) => {
	let result = null
	const file = files.find((file) => file.path.toLowerCase().indexOf(winner.text) !== -1)
	if (file) {
		let index = file.path.toLowerCase().indexOf(winner.text)
		if (winner.deleteText) {
			index += winner.text.length
		}
		result = file.path.substring(index)
		if (result.charAt(0) === '/') {
			result = result.substring(1)
		}

		let prefix = winner.prefix
		if (prefix && !prefix.endsWith('/')) {
			prefix += '/'
		}

		result = winner.prefix + result
		index = result.lastIndexOf('.')
		if (index !== -1) {
			result = result.substring(0, index)
		}
	}

	return result
}

Helper.getTarget = (files) => {
	let target = null
	Object.values(Winners).some((winner) => {
		target = Helper.findWinner(files, winner)
		return target
	})

	if (target) {
		return target
	}

	return null
}

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
		vscode.window.showInformationMessage('Cannot locate sap.ui.define() section!')
		return null
	}


	// Find if already defined
	const found = defineInfos.parameters.some((parameter) => parameter.toLowerCase().endsWith(word.toLowerCase()))
	if (found) {
		vscode.window.showInformationMessage(`Import "${word}" already exists!`)
		return false
	}

	const hardCoded = Object.keys(HARD_CODED).some((key) => {
		if (key.toLowerCase() === word.toLowerCase()) {
			Helper.processFile(editor, defineInfos, HARD_CODED[key], key)
			return true
		}

		return false
	})

	if (!hardCoded) {
		const glob = `**/${word}.js`
		vscode.workspace.findFiles(glob, '**/node_modules/**', 100)
		.then((files) => {
			const fileName = Helper.getTarget(files)
			Helper.processFile(editor, defineInfos, fileName, word)
		})
	}
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
