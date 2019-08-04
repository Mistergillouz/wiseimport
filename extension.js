// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const Helper = require('./helper')



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
