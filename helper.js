

export const Helper = {}
Helper.findImport = (document, word) => {
	const text = document.getText()
	const start = text.indexOf('sap.ui.define')
	const end = text.indexOf('function')
	if (start < 0 || end < 0) {
		return
	}
}



