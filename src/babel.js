export default function({ types: t, template }) {
  return {
    visitor: {
      ImportDeclaration(path, stats) {
        const highOrderComponentsSources = stats.opts.hocSources || ['@sector-labs/react-loadable'];
        const highOrderComponentsIdentifiers = [...(stats.opts.hocIdentifiers || []), 'Map'];
        let source = path.node.source.value;

        if (!highOrderComponentsSources.includes(source)) return;

        let defaultSpecifier = path.get('specifiers').find(specifier => {
          return specifier.isImportDefaultSpecifier();
        });

        if (!defaultSpecifier) return;

        let bindingName = defaultSpecifier.node.local.name;
        let binding = path.scope.getBinding(bindingName);

        binding.referencePaths.forEach(refPath => {
          let callExpression = refPath.parentPath;

          highOrderComponentsIdentifiers.forEach(identifier => {
              if (
                callExpression.isMemberExpression() &&
                callExpression.node.computed === false &&
                callExpression.get('property').isIdentifier({ name: identifier })
              ) {
                callExpression = callExpression.parentPath;
              }
          });

          if (!callExpression.isCallExpression()) return;

          let args = callExpression.get('arguments');
          if (args.length !== 1) throw callExpression.error;

          let options = args[0];
          if (!options.isObjectExpression()) return;

          let properties = options.get('properties');
          let propertiesMap = {};

          properties.forEach(property => {
            let key = property.get('key');
            propertiesMap[key.node.name] = property;
          });

          if (propertiesMap.webpack) {
            return;
          }

          let loaderMethod = propertiesMap.loader.get('value');
          let dynamicImports = [];

          loaderMethod.traverse({
            Import(path) {
              dynamicImports.push(path.parentPath);
            }
          });

          if (!dynamicImports.length) return;

          propertiesMap.loader.insertAfter(
            t.objectProperty(
              t.identifier('webpack'),
              t.arrowFunctionExpression(
                [],
                t.arrayExpression(
                  dynamicImports.map(dynamicImport => {
                    return t.callExpression(
                      t.memberExpression(
                      	t.identifier('require'),
                        t.identifier('resolveWeak'),
                      ),
                      [dynamicImport.get('arguments')[0].node],
                    )
                  })
                )
              )
            )
          );

          propertiesMap.loader.insertAfter(
            t.objectProperty(
              t.identifier('modules'),
              t.arrayExpression(
                dynamicImports.map(dynamicImport => {
                  return dynamicImport.get('arguments')[0].node;
                })
              )
            )
          );

          propertiesMap.loader.insertAfter(
            t.objectProperty(
              t.identifier('webpackChunkNames'),
              t.arrayExpression(
                dynamicImports.map(dynamicImport => {
                    const { leadingComments } = dynamicImport.get('arguments')[0].node;
                    const webpackChunkName = (leadingComments || [])
                        .map(leadingComment => leadingComment.value)
                        .filter(comment => /webpackChunkName/.test(comment))
                        .map(comment => comment.split(':')[1].replace(/["']/g, '').trim())
                        [0];

                    return t.stringLiteral(webpackChunkName || '');
                })
              )
            )
          );
        });
      }
    }
  };
}
