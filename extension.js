// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const Helper = require('./helper')
const EslintCodeProvider = require('./EslintCodeProvider');


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "wiseimport" is now active!');

	let disposable = vscode.commands.registerCommand('extension.wiseimport', function (optSelection) {
		// Get the active text editor
		let editor = vscode.window.activeTextEditor;

		if (editor) {
			const document = editor.document;
			const selection = optSelection instanceof vscode.Selection ? optSelection : editor.selection;

			// Get the word within the selection
			let word = Helper.getWordAtCursor(document, selection)
			if (word) {
				Helper.findImport(document, editor, word)
			}
		}
	});

	context.subscriptions.push(disposable);

	let disposable2 = vscode.commands.registerCommand('extension.wiseopen', function () {
		// Get the active text editor
		let editor = vscode.window.activeTextEditor;

		if (editor) {
			let document = editor.document;
			let selection = editor.selection;

			// Get the word within the selection
			let word = Helper.getWordAtCursor(document, selection)
			if (word) {
				Helper.openFile(word)
			}
		}
	});

	context.subscriptions.push(disposable2);

	const provider = new EslintCodeProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { pattern: '**/*.{ts,js}' }, // Adjust the file patterns as needed
      provider
    )
  );
}


exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
