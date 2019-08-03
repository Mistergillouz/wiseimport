/* eslint-disable max-statements, array-element-newline, max-lines */
sap.ui.define([
  'sap/bi/webi/core/flux/core/WebiAbstractHelper',
  'sap/bi/webi/jsapi/flux/constants/WebiObjectQualification',
  'sap/bi/webi/jsapi/flux/constants/WebiGeoQualification',
  'sap/bi/webi/jsapi/flux/constants/WebiCustomSortModes',
  'sap/bi/webi/core/flux/core/HelperRegistry',
  'sap/bi/smart/core/store/StoreRegistry',
  'sap/bi/webi/core/utils/ObjectUtils',
  'sap/bi/webi/jsapi/flux/utils/ContextUtils',
  'sap/bi/webi/lib/UI5Utils',
  'sap/bi/webi/lib/constants/AOT',
  'sap/bi/webi/components/document/dictionary/model/ExpressionNode'
], function ( // eslint-disable-line
  WebiAbstractHelper,
  WebiObjectQualification,
  WebiGeoQualification,
  WebiCustomSortModes,
  HelperRegistry,
  StoreRegistry,
  ObjectUtils,
  ContextUtils,
  UI5Utils,
  AOT,
  ExpressionNode
) {
  'use strict'

  const DictionaryHelper = WebiAbstractHelper.extend(
    'sap.bi.webi.components.document.dictionary.model.extension.DictionaryHelper', {
      metadata: {
        properties: {
          name: {
            type: 'string',
            defaultValue: 'Export helper'
          },
          type: { defaultValue: 'dictionaryHelper' }
        }
      }
    }
  )

  const MND_FORMULA_TAG = '="MeasureNamesAsDimension"'

  const NodeType = AOT.NodeType
  const NodeState = AOT.NodeState
  const NatureId = AOT.NatureId
  const ViewMode = AOT.ViewMode
  const MergeActions = AOT.MergeActions

  //
  // PUBLIC API
  //

  DictionaryHelper.prototype.getMergeAction = function (viewContext, dataObjectIds) {
    let result = MergeActions.NONE
    if (Array.isArray(dataObjectIds)) {
      if (dataObjectIds.length > 1) {
        if (this._canMerge(viewContext, dataObjectIds)) {
          result = MergeActions.MERGE
        } else if (this._canAddToMerge(viewContext, dataObjectIds)) {
          result = MergeActions.ADD_TO_MERGE
        }
      } else if (dataObjectIds.length === 1) {
        if (this._canRemoveFromMerge(viewContext, dataObjectIds[0])) {
          result = MergeActions.REMOVE_FROM_MERGE
        } else if (this.isLink(viewContext, dataObjectIds[0])) {
          result = MergeActions.UNMERGE
        }
      }
    }

    return result
  }

  /**
   * Create the available objects tree
   * @param {Object} context View context
   * @param {Object} dictionary document dictionary
   * @param {Object} viewModeId (AOT.ViewMode enum)
   * @param {Object} options (optional)
   * @param {Number} options.hanaOnline (optional) true if the document is in hanaonline mode
   * @returns {Object} A JSON object
   */
  DictionaryHelper.prototype.buildModel = function (context, dictionary, viewModeId, options = {}) {
    if (typeof options.hideEmptyFolder === 'undefined') {
      options.hideEmptyFolder = true
    }

    let nodes = null
    if (dictionary) {
      switch (viewModeId) {
        case ViewMode.Queries.id:
          nodes = this._buildQueryModel(context, dictionary, options)
          break
        case ViewMode.Folders.id:
          nodes = this._buildFolderModel(context, dictionary, options)
          break
        default:
          nodes = this._buildMasterModel(dictionary, options)
      }
    }

    return nodes
  }

  DictionaryHelper.prototype._buildFolderModel = function (context, dictionary, options) {  // eslint-disable-line
    const nodes = []

    const expressions = this._getExpressions(dictionary)
    const variables = this._buildVariables(dictionary, expressions)
    const references = this._buildReferences(dictionary)
    this._filterQualification(options.filters, variables, references)

    const dataProviders = StoreRegistry.getDocumentStore().getDataProviders(context)
    dataProviders.forEach((dataProvider) => {
      const queryNodes = this._getDataProviderNodes(dictionary, dataProvider, expressions, options)
      if (queryNodes.length) {
        const name = `${queryNodes[0].dataSourceName} (${queryNodes[0].dataProviderName})`
        const dataSourceNodes = this._reorderByFolders(context, queryNodes)
        const dsNode = this._newFolderNode(NodeType.DataSourceFolder, name, dataSourceNodes, {
          icon: 'sap-icon://database'
        })

        nodes.push(dsNode)
      }
    })

    // Links
    this._appendMergedDimensionsFolder(dictionary, nodes)

    if (variables.length) {
      nodes.push(
        this._newFolderNode(NodeType.VariableFolder,
          UI5Utils.getLocalizedText('aot.variables'),
          variables)
      )
    }

    if (references.length) {
      nodes.push(
        this._newFolderNode(NodeType.ReferenceFolder,
          UI5Utils.getLocalizedText('aot.references'),
          references)
      )
    }

    return nodes
  }

  DictionaryHelper.prototype._buildQueryModel = function (context, dictionary, options) {  // eslint-disable-line
    const nodes = []
    const expressions = this._getExpressions(dictionary)
    const variables = this._buildVariables(dictionary, expressions)
    const dataProviders = StoreRegistry.getDocumentStore().getDataProviders(context)
    dataProviders.forEach((dataProvider) => {
      const queryNodes = this._getDataProviderNodes(dictionary, dataProvider, expressions, options)
      const dataProviderNode = this._newFolderNode(NodeType.DataProviderFolder, dataProvider.name, queryNodes, {
        icon: 'sap-icon://database'
      })

      nodes.push(dataProviderNode)
    })

    // Links
    this._appendMergedDimensionsFolder(dictionary, nodes)

    // Handle variables
    const variablesNode = this._newFolderNode(NodeType.VariableFolder, UI5Utils.getLocalizedText('aot.variables'), [])

    // Variables without an associated dataprovider first
    const orphanVariables = variables
      .filter((variable) => !variable.dataProviderId)
      .map((variable) => this._toVariable(variable))

    if (orphanVariables.length) {
      this._filterQualification(options.filters, orphanVariables)
      variablesNode.nodes = orphanVariables
    }

    dataProviders.forEach((dataProvider) => {
      const dataProviderVariables = variables
        .filter((variable) => variable.dataProviderId === dataProvider.id)
        .map((variable) => this._toVariable(variable))

      if (dataProviderVariables.length) {
        this._filterQualification(options.filters, dataProviderVariables)
        const queryVariableNode = this._newSubFolderNode(
          NodeType.DataProvider,
          dataProvider.name,
          dataProviderVariables
        )
        variablesNode.nodes.push(queryVariableNode)
      }
    })

    if (variablesNode.nodes.length) {
      nodes.push(variablesNode)
    }

    const references = this._buildReferences(dictionary)
    this._filterQualification(options.filters, references)

    if (references.length) {
      nodes.push(
        this._newFolderNode(NodeType.ReferenceFolder,
          UI5Utils.getLocalizedText('aot.references'),
          references)
      )
    }

    return nodes
  }

  DictionaryHelper.prototype._buildMasterModel = function (dictionary, options) { // eslint-disable-line
    const expressions = this._getExpressions(dictionary)
    const variables = this._buildVariables(dictionary, expressions)
    const references = this._buildReferences(dictionary)
    const [dimensions, measures] = this._buildExpressions(dictionary, expressions,
      Object.assign({ includeLinks: true }, options))

    this._filterQualification(options.filters, dimensions, measures, variables, references)

    const nodes = []
    if (!options.hideDimensions) {
      if (!options.hideEmptyFolder || dimensions.length > 0) {
        nodes.push(this._newFolderNode(
          NodeType.DimensionFolder,
          UI5Utils.getLocalizedText('aot.dimensions'),
          dimensions
        ))
      }
    }
    if (!options.hideMeasures) {
      if (!options.hideEmptyFolder || measures.length > 0) {
        nodes.push(this._newFolderNode(
          NodeType.MeasureFolder,
          UI5Utils.getLocalizedText('aot.measures'),
          measures
        ))
      }
    }
    if (!options.hideVariables) {
      let actualVariables = variables
      if (options.hideConstants) {
        actualVariables = variables.filter(
          (variable) => !(variable['@constant'] === 'true')
        )
      }
      if (!options.hideEmptyFolder || actualVariables.length > 0) {
        nodes.push(this._newFolderNode(
          NodeType.VariableFolder,
          UI5Utils.getLocalizedText('aot.variables'),
          actualVariables
        ))
      }
    }
    if (!options.hideReferences) {
      if (!options.hideEmptyFolder || references.length > 0) {
        nodes.push(this._newFolderNode(
          NodeType.ReferenceFolder,
          UI5Utils.getLocalizedText('aot.references'),
          references
        ))
      }
    }

    return nodes
  }

  DictionaryHelper.prototype._buildExpressions = function (dictionary, dictExpressions, args) { // eslint-disable-line
    let dpExpressions = dictExpressions.map((expression) => this.toDpObject(expression))
    if (args.dataProviderId) {
      dpExpressions = dpExpressions.filter((expression) => {
        // Time dimension nodes do not have its dataProviderId set
        let currentExpression = expression
        while (currentExpression.associatedDimensionId) {
          const parentExpression = this._findExpressionId(dictExpressions, currentExpression.associatedDimensionId)
          if (parentExpression) {
            expression.dataProviderId = parentExpression.dataProviderId
            currentExpression = parentExpression
          }
        }

        return expression.dataProviderId === args.dataProviderId
      })
    }

    dpExpressions.forEach((expression) => {
      if (WebiObjectQualification.byId(expression['@qualification']) === WebiObjectQualification.HIERARCHY) {
        this._appendAssociatedDimensions(expression, dpExpressions)
      }
      if (expression.natureId) {
        this._applyNatureId(dictionary, dpExpressions, expression)
      }
    })

    if (args.includeLinks) {
      dpExpressions.forEach((expression) => {
        const link = this._getLinkOwner(dictionary, expression.id)
        if (link) {
          this._applyLink(dictionary, link, dpExpressions, expression)
        }
      })
    }

    // Take care of objects with same name coming from differents dataproviders
    this._fixDuplicate(dpExpressions)

    // Finally sort the list!
    dpExpressions.sort((a0, b0) => a0.displayName.localeCompare(b0.displayName))

    // Add Measure Names as Dimensions (must be displayed at the bottom of expressions list)
    if (args.mnd) {
      dpExpressions.push(this._getMeasureNamesAsDimensionExpression())
    }

    const dimensions = []
    const measures = []
    dpExpressions.forEach((expression) => {
      if (expression['@qualification'] === 'Measure') {
        measures.push(expression)
      } else {
        dimensions.push(expression)
      }
    })

    // Handle hana online document: disable popup menu on everything except measure/variables/references
    if (args.hanaOnline) {
      this.visitNodes(dimensions, (expression) => {
        expression.hasMoreMenu = false
      })
    }

    return [dimensions, measures]
  }

  // BuildVariables needs the dictionary expressions list because if a variable have a geo,
  // Its levels are located into the dictionary expressions and not into the variables list.
  // So these levels needs to be removed from the expressions list.
  DictionaryHelper.prototype._buildVariables = function (dictionary, expressions) {
    const variables = this._getVariables(dictionary)
    const varExpressions = variables.map((variable) => {
      const varExpression = this._toVariable(variable)
      if (varExpression.natureId) {
        this._applyNatureId(dictionary, expressions, varExpression)
      }

      return varExpression
    })

    return varExpressions
  }

  DictionaryHelper.prototype._buildReferences = function (dictionary) {
    return this._getReferences(dictionary).map((reference) => this._toReference(reference))
  }

  DictionaryHelper.prototype._applyLink = function (dictionary, link, expressions, expression) {
    const expressionIndex = expressions.indexOf(expression)
    const linkNode = this._createLinkNode(dictionary, link, expressions, true)
    expressions.splice(expressionIndex, 0, linkNode)
  }

  DictionaryHelper.prototype._getLinksNodes = function (dictionary, expressions) {
    const links = this._getLinks(dictionary)
    const linkNodes = links.map((link) => this._createLinkNode(dictionary, link, expressions, false))
    return linkNodes
  }

  DictionaryHelper.prototype._createLinkNode = function (dictionary, link, expressions, removeExpression) {
    const linkNode = this._toLink(link)
    const linkExpressions = this.getLinkExpressions(link)
    const variables = this._getVariables(dictionary)
    linkExpressions.forEach((linkExpression) => {
      let expression = null
      const index = expressions.findIndex((expr) => expr.id === linkExpression['@id'])
      if (index === -1) {
        const variable = variables.find((aVariable) => aVariable.id === linkExpression['@id'])
        if (variable) {
          expression = this.toDpObject(variable)
        }
      } else {
        expression = expressions[index]
        if (removeExpression) {
          expressions.splice(index, 1)
        }
      }

      if (expression) {
        expression.displayName = expression.name
        if (expression.dataProviderName) {
          expression.displayName += ` (${expression.dataProviderName})`
        }

        linkNode.nodes.push(expression)
      }
    })

    if (link.geoQualification) {
      this._appendAssociatedDimensions(linkNode, expressions)
      this._setExpressionNodeType(linkNode, NatureId.Geography)
    }

    return linkNode
  }

  DictionaryHelper.prototype._appendAssociatedDimensions = function (expression, expressions) {
    for (let i = expressions.length - 1; i >= 0; i--) {
      let expr = expressions[i]
      if (expr.associatedDimensionId === expression.id) {
        if (!(expr instanceof ExpressionNode)) {
          expr = this.toDpObject(expr)
        }

        expression.nodes.push(expr)
        // Remove it
        expressions.splice(i, 1)
        // Drill into
        this._appendAssociatedDimensions(expr, expressions)
      }
    }
  }

  DictionaryHelper.prototype._getDataProviderNodes = function (dictionary, dataProvider, expressions, options) {
    const [dimensions, measures] = this._buildExpressions(dictionary, expressions, Object.assign({
      includeLinks: false,
      dataProviderId: dataProvider.id
    }, options))

    this._filterQualification(options.filters, dimensions, measures)

    const queryNodes = dimensions.concat(measures)
    return queryNodes
  }

  DictionaryHelper.prototype._reorderByFolders = function (viewContext, nodes) {
    const fnNewFolder = () => ({
      nodes: [],
      children: {}
    })

    const paths = StoreRegistry.getDocumentStore().getPaths(viewContext) || {}
    const folders = fnNewFolder()
    nodes.forEach((node) => {
      const path = paths[node.id]
      if (Array.isArray(path) && path.length) {
        const folder = path.reduce((currentFolder, pathPart) => {
          if (!currentFolder.children[pathPart]) {
            currentFolder.children[pathPart] = fnNewFolder()
          }
          return currentFolder.children[pathPart]
        }, folders)

        folder.nodes.push(node)
      } else {
        // Orphan node
        folders.nodes.push(node)
      }
    })

    const folderNodes = []
    this._visitFolder(folders.children, folderNodes)

    // Add orphans nodes
    return folderNodes.concat(folders.nodes)
  }

  DictionaryHelper.prototype._visitFolder = function (folders, nodes) {
    Object.keys(folders)
      .sort((f0, f1) => f0.localeCompare(f1))
      .forEach((key) => {
        const folder = folders[key]
        const universeFolder = this._newFolderNode(NodeType.UniverseFolder, key, folder.nodes, {
          icon: 'sap-icon://folder-blank',
          style: 'Normal'
        })
        nodes.push(universeFolder)
        this._visitFolder(folder.children, universeFolder.nodes)
      })
  }

  DictionaryHelper.prototype._appendMergedDimensionsFolder = function (dictionary, nodes) {
    // HACK: Recover created nodes
    let expressions = nodes.reduce((acc, node) => acc.concat(node.nodes), [])
    expressions = expressions.reduce((acc, node) => acc.concat(node.nodes), expressions)

    // Append expressions without dataprovider
    const noDpExprs = this._getExpressions(dictionary)
      .filter((expression) => !expression.dataProviderId)
      .map((expression) => this.toDpObject(expression))

    expressions = expressions.concat(noDpExprs)

    const linkNodes = this._getLinksNodes(dictionary, expressions)
    if (linkNodes.length) {
      const linkNode = this._newFolderNode(NodeType.MergedDimensionFolder,
        UI5Utils.getLocalizedText('aot.mergedDimensions'),
        linkNodes)

      nodes.push(linkNode)
    }
  }

  DictionaryHelper.prototype.visitNodes = function (nodes, callback) { // eslint-disable-line
    let result = null
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      result = callback(node) // eslint-disable-line
      if (result) {
        break
      }
      if (Array.isArray(node.nodes) && node.nodes.length) {
        result = this.visitNodes(node.nodes, callback)
        if (result) {
          break
        }
      }
    }

    return result
  }

  DictionaryHelper.prototype.getExpressionDisplayName = function (viewContext, dictObject) {
    let name = null
    if (dictObject) {
      name = dictObject.name
      if (dictObject.dataProviderName) {
        const dps = StoreRegistry.getDocumentStore().getDataProviders(viewContext)
        if (dps.length > 1) {
          const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext)
          const doublons = dictionary.expression.reduce((acc, expression) => {
            const count = expression.name === name ? acc + 1 : acc
            return count
          }, 0)
          if (doublons > 1) {
            name += ` (${dictObject.dataProviderName})`
          }
        }
      }
    }

    return name
  }

  DictionaryHelper.prototype.getQualificationIcon = function (dictObject) {
    if (this.isMNDExpression(dictObject)) {
      return 'sap-icon://grid'
    }

    return WebiObjectQualification.getIcon(dictObject['@qualification'])
  }

  DictionaryHelper.prototype.getQualificationIconColor = function (dictObject) {
    return WebiObjectQualification.getIconColor(dictObject['@qualification'])
  }

  DictionaryHelper.prototype.createMNDExpression = function () {
    return {
      $: MND_FORMULA_TAG,
      '@qualification': 'Dimension',
      '@dataType': 'String',
      name: UI5Utils.getLocalizedText('feeding.mnd')
    }
  }

  // Check for Measure Name as Dimension expression
  DictionaryHelper.prototype.isMNDExpression = function (expression) {
    return expression && expression.$ === MND_FORMULA_TAG
  }

  DictionaryHelper.prototype._newSubFolderNode = function (nodeType, displayName, nodes, args) {
    const options = Object.assign({ style: 'subFolder' }, args)
    const node = this._newFolderNode(nodeType, displayName, nodes, options)
    return node
  }

  DictionaryHelper.prototype._newFolderNode = function (nodeType, displayName, nodes, args) {
    const node = this.newNode(nodeType, {
      displayName,
      nodes,
      selectable: false,
      hasMoreMenu: false,
      style: 'folder'
    }, args)

    return node
  }

  DictionaryHelper.prototype.newNode = function (nodeType, object, args) {
    const node = new ExpressionNode(nodeType, Object.assign({
      nodeState: NodeState.Normal,
      selectable: true,
      hasMoreMenu: true,
      hover: false,
      style: '',
      nodes: [],
      stripped: ObjectUtils.parseBoolean(object['@stripped']),
      dataTypeText: this._getObjectDataType(object),
      aggregationFunctionText: this._getLocalizedAggregationFunction(object.aggregationFunction),
      customSortText: this._getCustomSortTooltipText(object)
    }, object, args))

    let additionalDescription = ''
    if (node.stripped) {
      additionalDescription = UI5Utils.getLocalizedText('aot.stripped')
    } else if (object.geoMappingResolution === 'Partial') {
      additionalDescription = UI5Utils.getLocalizedText('aot.geoPartial')
    }

    node.additionalDescription = additionalDescription
    return node
  }

  DictionaryHelper.prototype.getCustomSortMode = function (expression) {
    if (WebiObjectQualification.byId(expression['@qualification']) === WebiObjectQualification.MEASURE) {
      return null
    }
    return WebiCustomSortModes.byId(expression['@customSort'])
  }

  //
  // PRIVATE METHODS
  //

  /* eslint-disable arrow-body-style */
  DictionaryHelper.prototype._filterQualification = function (filters, ...expressionsArrays) {
    if (filters && Array.isArray(filters.qualifications)) {
      expressionsArrays.forEach((expressions) => {
        for (let i = expressions.length - 1; i >= 0; i--) {
          const expression = expressions[i]
          if (filters.qualifications.indexOf(expression['@qualification']) === -1) {
            expressions.splice(i, 1)
          }
        }
      })
    }

    if (filters && Array.isArray(filters.dataTypes)) {
      expressionsArrays.forEach((expressions) => {
        for (let i = expressions.length - 1; i >= 0; i--) {
          const expression = expressions[i]
          if (filters.dataTypes.indexOf(expression['@dataType']) === -1) {
            expressions.splice(i, 1)
          }
        }
      })
    }

    if (filters && Array.isArray(filters.hideObjects)) {
      expressionsArrays.forEach((expressions) => {
        for (let i = expressions.length - 1; i >= 0; i--) {
          const expression = expressions[i]
          if (filters.hideObjects.indexOf(expression.id) !== -1) {
            expressions.splice(i, 1)
          }
        }
      })
    }
  }

  DictionaryHelper.prototype._setExpressionNodeType = function (expression, natureId) {
    switch (natureId) {
      case NatureId.Time:
        expression.addNodeType(NodeType.TimeDimension)
        break

      case NatureId.Geography:
        expression.icon = 'sap-icon://world'
        expression.dataTypeText = UI5Utils.getLocalizedText('aot.geography')
        expression.addNodeType(NodeType.Geo)
        break

      default:
    }
  }

  DictionaryHelper.prototype._applyNatureId = function (dictionary, expressions, expression) {
    const natureId = expression.natureId
    this._setExpressionNodeType(expression, natureId)

    let nodeLevelType = null
    switch (natureId) {
      case NatureId.Time: {
        nodeLevelType = NodeType.TimeLevel
        break
      }

      case NatureId.Geography:
        nodeLevelType = NodeType.GeoLevel
        break

      default:
        return
    }

    this._appendAssociatedDimensions(expression, expressions)

    expression.hasMoreMenu = true
    expression.nodes.forEach((childNode) => {
      childNode.hasMoreMenu = false
      childNode.selectable = true
      childNode.addNodeType(nodeLevelType)
    })

    // For each time level, place it in its own folder
    if (natureId === NatureId.Time) {
      const timeModelNodes = {}
      const timeModels = this._getTimeModels(dictionary)
      expression.nodes.forEach((childNode) => {
        const timeModelId = childNode.timeModelId
        const timeModel = timeModels.find((model) => model.id === timeModelId)
        if (timeModel) {
          if (!timeModelNodes[timeModelId]) {
            timeModel.dataObjectId = expression.id
            timeModel.dataObjectName = expression.displayName
            timeModelNodes[timeModelId] = this._toTimeModel(timeModel)
          }
          timeModelNodes[timeModelId].nodes.push(childNode)
        }
      })

      expression.nodes = Object.values(timeModelNodes)
    }
  }

  DictionaryHelper.prototype._findExpressionId = function (expressions, id) {
    const result = this.visitNodes(expressions, (expression) => {  // eslint-disable-line
      return expression.id === id ? expression : null
    })
    return result
  }

  DictionaryHelper.prototype._getExpressions = function (dictionary) {
    return (dictionary.expression || []).slice()
  }

  DictionaryHelper.prototype._getLinks = function (dictionary) {
    return dictionary.link || []
  }

  DictionaryHelper.prototype._getTimeModels = function (dictionary) {
    return dictionary.timeModel || []
  }

  DictionaryHelper.prototype._getVariables = function (dictionary) {
    return (dictionary.variable || []).slice()
  }

  DictionaryHelper.prototype._getReferences = function (dictionary) {
    return dictionary.refcell || []
  }

  DictionaryHelper.prototype._fixDuplicate = function (expressions) {
    const map = {}
    expressions.forEach((object) => {
      const key = object.displayName
      if (!map[key]) {
        map[key] = 0
      }

      map[key] += 1
    })

    expressions.forEach((object) => {
      if (object.dataProviderName && map[object.displayName] > 1) {
        object.displayName += ` (${object.dataProviderName})`
      }
    })
  }

  DictionaryHelper.prototype.toDpObject = function (dictObject) {
    const node = this.newNode(NodeType.Object, dictObject, {
      icon: this.getQualificationIcon(dictObject),
      color: this.getQualificationIconColor(dictObject),
      customSort: dictObject['@customSort'] === 'Defined',
      displayName: dictObject.name
    })

    return node
  }

  DictionaryHelper.prototype._toLink = function (link) {
    return this.newNode(NodeType.Link, link, {
      icon: 'sap-icon://chain-link',
      displayName: link.name
    })
  }

  DictionaryHelper.prototype._toVariable = function (variable) {
    const node = this.toDpObject(variable)
    node.setNodeType(NodeType.Variable)
    return node
  }

  DictionaryHelper.prototype._toReference = function (ref) {
    return this.newNode(NodeType.Reference, ref, {
      icon: 'sap-icon://fpaIcons/reference',
      displayName: ref.name
    })
  }

  DictionaryHelper.prototype._toDataProvider = function (dp) {
    return this.newNode(NodeType.DataProvider, dp, {
      icon: 'sap-icon://folder-blank',
      displayName: dp.name
    })
  }

  DictionaryHelper.prototype._toDataSource = function (unv) {
    return this.newNode(NodeType.DataSource, unv, {
      icon: 'sap-icon://folder-blank',
      displayName: unv.name
    })
  }

  DictionaryHelper.prototype._toDataSourceFolder = function (unvFolder) {
    return this.newNode(NodeType.UniverseFolder, unvFolder, {
      displayName: unvFolder.name,
      icon: 'sap-icon://folder-blank'
    })
  }

  DictionaryHelper.prototype._toTimeModel = function (timeModel) {
    return this.newNode(NodeType.TimeModel, {
      displayName: timeModel.name,
      description: timeModel.description,
      timeModelId: timeModel.id,
      dataObjectId: timeModel.dataObjectId,
      dataObjectName: timeModel.dataObjectName,
      dataTypeText: this._getLocalizedDataType('DateTime'),
      icon: 'sap-icon://history',
      selectable: false,
      nodes: []
    })
  }

  const DataTypes = {
    String: 'aot.dataType.string',
    Numeric: 'aot.dataType.numeric',
    Date: 'aot.dataType.date',
    DateTime: 'aot.dataType.dateTime',
    Decimal: 'aot.dataType.decimal'
  }

  DictionaryHelper.prototype._getObjectDataType = function (dictObject) {
    let dataType = dictObject['@dataType']
    if (ObjectUtils.parseBoolean(dictObject['@highPrecision'])) {
      dataType = 'Decimal'
    }

    return this._getLocalizedDataType(dataType)
  }

  DictionaryHelper.prototype._getLocalizedDataType = function (dataType) {
    const id = DataTypes[dataType]
    return id ? UI5Utils.getLocalizedText(id) : ''
  }

  DictionaryHelper.prototype._getCustomSortTooltipText = function (object) {
    const mode = WebiCustomSortModes.byId(object['@customSort'])
    if (mode === WebiCustomSortModes.DEFINED) {
      return UI5Utils.getLocalizedText('aot.customSortApplied')
    }

    return ''
  }

  DictionaryHelper.prototype._getLocalizedAggregationFunction = function (aggregationFunction) {
    const aggregationFunctions = {
      Average: 'aot.aggrFunction.average',
      Count: 'aot.aggrFunction.count',
      CountWithoutEmpty: 'aot.aggrFunction.countWithoutEmpty',
      Delegated: 'aot.aggrFunction.delegated',
      First: 'aot.aggrFunction.first',
      Last: 'aot.aggrFunction.last',
      Max: 'aot.aggrFunction.max',
      Min: 'aot.aggrFunction.min',
      None: 'aot.aggrFunction.none',
      Sum: 'aot.aggrFunction.sum'
    }

    const id = aggregationFunctions[aggregationFunction]
    return id ? UI5Utils.getLocalizedText(id) : ''
  }

  DictionaryHelper.prototype._getMeasureNamesAsDimensionExpression = function () {
    const expression = this.toDpObject(this.createMNDExpression())
    return Object.assign(expression, {
      hasMoreMenu: false
    })
  }

  DictionaryHelper.prototype.createRaylightAxisExpression = function (dictObject) {
    return {
      '@hide': 'false',
      '@dataType': dictObject['@dataType'],
      '@qualification': dictObject['@qualification'],
      '@dataObjectId': dictObject.id || dictObject['@dataObjectId']
    }
  }

  DictionaryHelper.prototype._canRemoveFromMerge = function (viewContext, dataObjectId) {
    const link = this.getLinkOwner(viewContext, dataObjectId)
    if (link) {
      const MIN_OBJECT_MERGED = 3
      const linkExpressions = this.getLinkExpressions(link)
      return linkExpressions.length >= MIN_OBJECT_MERGED
    }

    return false
  }

  DictionaryHelper.prototype._canAddToMerge = function (viewContext, dataObjectIds) {
    // At least 2 objects (a link + another expression)
    if (dataObjectIds.length < 2) { // eslint-disable-line
      return false
    }

    // 1st find target link (and only one link)
    const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext)
    const links = this._getLinks(dictionary)
    let targetLink = null

    const checked = dataObjectIds.every((dataObjectId) => {
      const link = links.find((aLink) => aLink.id === dataObjectId)
      if (link) {
        if (targetLink) {
          return false
        }
        targetLink = link
      }

      return true
    })

    if (!checked || !targetLink) {
      return false
    }

    // Append link expressions to dataobjects ids excluding target link id
    const linkExpressions = this.getLinkExpressions(targetLink)
    const mergeIds = linkExpressions
      .map((linkExpression) => linkExpression['@id'])
      .concat(dataObjectIds.filter((dataObjectId) => dataObjectId !== targetLink.id))

    const canMerge = this._canMerge(viewContext, mergeIds, targetLink.id)
    return canMerge
  }

  DictionaryHelper.prototype._canMerge = function (viewContext, dataObjectIds, excludeLinkId = null) { // eslint-disable-line
    const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext)
    const links = this._getLinks(dictionary)

    // Exclude links and links expressions
    const excludedIds = {}
    if (Array.isArray(links)) {
      links
        .filter((link) => link.id !== excludeLinkId)
        .forEach((link) => {
          excludedIds[link.id] = true
          this.getLinkExpressions(link).forEach((linkExpression) => {
            excludedIds[linkExpression['@id']] = true
          })
        })
    }

    const dpStoreHelper = HelperRegistry.getDataProviderStoreHelper()
    const dpMap = {}
    let dataType = null
    let hasHierarchy = false
    let hasVariable = false
    let geoQualification = null

    let result = dataObjectIds.every((dataObjectId) => {
      if (excludedIds[dataObjectId]) {
        return false
      }
      const dictObject = dpStoreHelper.getObject(ContextUtils.assign(viewContext, { dataObjectId }))
      if (!dictObject) {
        return false
      }

      const qualification = WebiObjectQualification.byId(dictObject['@qualification'])
      switch (qualification) {
        case WebiObjectQualification.HIERARCHY:
          hasHierarchy = true
          break

        case WebiObjectQualification.DIMENSION:
        case WebiObjectQualification.ATTRIBUTE:
          break

        default:
          return false
      }

      const variables = this._getVariables(dictionary)
      if (Array.isArray(variables) && variables.find((variable) => variable.id === dataObjectId)) {
        hasVariable = true
      }

      if (dictObject.stripped) {
        return false
      }

      if (dataType && dataType !== dictObject['@dataType']) {
        return false
      }
      const dpId = dictObject.dataProviderId
      if (!dpId || dpMap[dpId]) {
        return false
      }

      const currentGeoQualification = dictObject.geoQualification
      if (currentGeoQualification) {
        if (WebiGeoQualification.byId(currentGeoQualification) === WebiGeoQualification.LONGLAT) {
          return false
        }
        if (geoQualification && geoQualification !== currentGeoQualification) {
          return false
        }
        geoQualification = currentGeoQualification
      }

      dataType = dictObject['@dataType']
      dpMap[dpId] = true
      return true
    })

    if (hasHierarchy && hasVariable) {
      result = false
    }

    return result
  }

  DictionaryHelper.prototype._getDictionaryObject = function (dictionary, id) {
    let dictObject = this._getExpressions(dictionary).find((object) => object.id === id)
    if (!dictObject) {
      dictObject = this._getVariables(dictionary).find((object) => object.id === id)
    }

    return dictObject
  }

  DictionaryHelper.prototype.getLinkOwner = function (viewContext, dataObjectId) {
    const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext)
    return this._getLinkOwner(dictionary, dataObjectId)
  }

  DictionaryHelper.prototype._getLinkOwner = function (dictionary, dataObjectId) {
    const links = this._getLinks(dictionary)
    const elementLink = links.find((link) => {
      const linkExpressions = this.getLinkExpressions(link)
      return linkExpressions.some((linkExpression) => linkExpression['@id'] === dataObjectId)
    })

    return elementLink
  }

  DictionaryHelper.prototype.getLinkExpressions = function (link) {
    const linkExpressions = ObjectUtils.getProperty(link, 'linkedExpressions.linkedExpression', [])
    return linkExpressions
  }

  DictionaryHelper.prototype.isLink = function (viewContext, id) {
    const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext)
    const links = this._getLinks(dictionary)
    return links.some((link) => link.id === id)
  }

  return DictionaryHelper
})
