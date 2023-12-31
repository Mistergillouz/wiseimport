const vscode = require('vscode');

class EslintCodeProvider {
  provideCodeActions(document, range, context, token) {
    // Filter ESLint code actions
    const eslintActions = context.diagnostics
      .filter((diagnostic) => diagnostic.source === 'eslint')
      .map((diagnostic) => this.createCodeAction(diagnostic));

    return eslintActions;
  }

  createCodeAction(diagnostic) {
    const selection = new vscode.Selection(diagnostic.range.start, diagnostic.range.end);
    const action = new vscode.CodeAction('➤ Generate Import [WISE]', vscode.CodeActionKind.QuickFix);
    action.isPreferred = true;
    action.command = {
      title: 'Import Wise File',
      command: 'extension.wiseimport',
      arguments: [selection],
    };

    return action;
  }
}

module.exports = EslintCodeProvider
