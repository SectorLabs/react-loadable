'use strict';

exports.__esModule = true;

exports.default = function (_ref) {
  var t = _ref.types,
      template = _ref.template;

  return {
    visitor: {
      ImportDeclaration: function ImportDeclaration(path, stats) {
        var highOrderComponentsSources = stats.opts.hocSources || ['@sector-labs/react-loadable'];
        var highOrderComponentsIdentifiers = [].concat(stats.opts.hocIdentifiers || [], ['Map']);
        var source = path.node.source.value;

        if (!highOrderComponentsSources.includes(source)) return;

        var defaultSpecifier = path.get('specifiers').find(function (specifier) {
          return specifier.isImportDefaultSpecifier();
        });

        if (!defaultSpecifier) return;

        var bindingName = defaultSpecifier.node.local.name;
        var binding = path.scope.getBinding(bindingName);

        binding.referencePaths.forEach(function (refPath) {
          var callExpression = refPath.parentPath;

          highOrderComponentsIdentifiers.forEach(function (identifier) {
            if (callExpression.isMemberExpression() && callExpression.node.computed === false && callExpression.get('property').isIdentifier({ name: identifier })) {
              callExpression = callExpression.parentPath;
            }
          });

          if (!callExpression.isCallExpression()) return;

          var args = callExpression.get('arguments');
          if (args.length !== 1) throw callExpression.error;

          var options = args[0];
          if (!options.isObjectExpression()) return;

          var properties = options.get('properties');
          var propertiesMap = {};

          properties.forEach(function (property) {
            var key = property.get('key');
            propertiesMap[key.node.name] = property;
          });

          if (propertiesMap.webpack) {
            return;
          }

          var loaderMethod = propertiesMap.loader.get('value');
          var dynamicImports = [];

          loaderMethod.traverse({
            Import: function Import(path) {
              dynamicImports.push(path.parentPath);
            }
          });

          if (!dynamicImports.length) return;

          propertiesMap.loader.insertAfter(t.objectProperty(t.identifier('webpack'), t.arrowFunctionExpression([], t.arrayExpression(dynamicImports.map(function (dynamicImport) {
            return t.callExpression(t.memberExpression(t.identifier('require'), t.identifier('resolveWeak')), [dynamicImport.get('arguments')[0].node]);
          })))));

          propertiesMap.loader.insertAfter(t.objectProperty(t.identifier('modules'), t.arrayExpression(dynamicImports.map(function (dynamicImport) {
            return dynamicImport.get('arguments')[0].node;
          }))));

          propertiesMap.loader.insertAfter(t.objectProperty(t.identifier('webpackChunkNames'), t.arrayExpression(dynamicImports.map(function (dynamicImport) {
            var leadingComments = dynamicImport.get('arguments')[0].node.leadingComments;

            var webpackChunkName = (leadingComments || []).map(function (leadingComment) {
              return leadingComment.value;
            }).filter(function (comment) {
              return (/webpackChunkName/.test(comment)
              );
            }).map(function (comment) {
              return comment.split(':')[1].replace(/["']/g, '').trim();
            })[0];

            return t.stringLiteral(webpackChunkName || '');
          }))));
        });
      }
    }
  };
};